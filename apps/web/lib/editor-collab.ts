// CS-4 — Yjs ⟷ socket.io bridge over the API's `/editor` namespace (D3/D4). No y-websocket daemon:
// this thin provider relays opaque base64 CRDT + awareness bytes and lets Yjs idempotency make
// ordering/overlap harmless. Exposes `.awareness` so TipTap's CollaborationCaret binds to it directly.
import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { EDITOR_WS_EVENTS, type WsEditorSync } from '@encre-et-plume/shared';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

export type CollabStatus = 'connecting' | 'connected' | 'reconnecting';

const toB64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
const fromB64 = (b: string): Uint8Array => {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
};

export interface EditorCollabHandlers {
  onStatus?: (status: CollabStatus) => void;
  onSync?: (payload: WsEditorSync) => void;
  onPeers?: (count: number) => void;
  onMaterialized?: (assetId: string) => void;
  onComment?: (raw: unknown) => void;
}

/**
 * One provider per open editor route. `pageId` names the join; after the server materializes the
 * scenario the room migrates asset-side transparently (the server re-broadcasts to whichever room
 * the client joined). The client just re-joins on `materialized` so two cards sharing one asset
 * collaborate in one room.
 */
export class EditorCollabProvider {
  readonly socket: Socket;
  readonly awareness: Awareness;
  status: CollabStatus = 'connecting';
  private throttle: ReturnType<typeof setTimeout> | null = null;
  private pending: Uint8Array[] = [];
  // Set true by destroy(): a StrictMode double-mount tears down this provider and creates a fresh
  // one. socket.disconnect() disables auto-reconnect, so its `disconnect` event must NOT latch the
  // status to 'reconnecting' — otherwise the (now-dead) instance leaves the UI stuck on the banner.
  private destroyed = false;

  constructor(
    private readonly doc: Y.Doc,
    private readonly pageId: string,
    private readonly handlers: EditorCollabHandlers = {},
    /** D9 — open a chosen scenario/texte asset (file dropdown / import) instead of the card default. */
    private readonly assetId?: string,
  ) {
    this.awareness = new Awareness(doc);
    this.socket = io(`${API_ORIGIN}/editor`, { withCredentials: true });

    // ── local doc changes → throttled relay (merge queued updates before emit) ──
    doc.on('update', this.onLocalUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);

    this.socket.on('connect', () => {
      this.setStatus('connected');
      this.socket.emit(EDITOR_WS_EVENTS.join, this.joinPayload());
    });
    this.socket.on('disconnect', () => {
      if (this.destroyed) return;
      this.setStatus('reconnecting');
    });
    this.socket.io.on('reconnect_attempt', () => {
      if (this.destroyed) return;
      this.setStatus('reconnecting');
    });

    this.socket.on(EDITOR_WS_EVENTS.sync, (payload: WsEditorSync) => {
      if (payload.ydocState) Y.applyUpdate(doc, fromB64(payload.ydocState), this);
      for (const u of payload.updates) Y.applyUpdate(doc, fromB64(u), this);
      handlers.onSync?.(payload);
      handlers.onPeers?.(payload.peers + 1);
      // Broadcast our full state so a peer that joined in the DB-read window converges.
      this.socket.emit(EDITOR_WS_EVENTS.stateRequest, {});
      this.emitAwarenessFull();
    });

    this.socket.on(EDITOR_WS_EVENTS.update, (p: { u: string }) => {
      Y.applyUpdate(doc, fromB64(p.u), this);
    });
    this.socket.on(EDITOR_WS_EVENTS.awareness, (p: { a: string }) => {
      applyAwarenessUpdate(this.awareness, fromB64(p.a), this);
      handlers.onPeers?.(this.awareness.getStates().size);
    });
    this.socket.on(EDITOR_WS_EVENTS.stateRequest, () => {
      this.socket.emit(EDITOR_WS_EVENTS.stateResponse, { s: toB64(Y.encodeStateAsUpdate(doc)) });
      this.emitAwarenessFull();
    });
    this.socket.on(EDITOR_WS_EVENTS.stateResponse, (p: { s: string }) => {
      Y.applyUpdate(doc, fromB64(p.s), this);
    });
    this.socket.on(EDITOR_WS_EVENTS.materialized, (p: { assetId: string }) => {
      handlers.onMaterialized?.(p.assetId);
      // Re-join so the server can move us into the asset room.
      this.socket.emit(EDITOR_WS_EVENTS.join, this.joinPayload());
    });
    this.socket.on(EDITOR_WS_EVENTS.comment, (p: { comment: unknown }) => {
      handlers.onComment?.(p.comment);
    });
  }

  private joinPayload() {
    return this.assetId ? { pageId: this.pageId, assetId: this.assetId } : { pageId: this.pageId };
  }

  private setStatus(s: CollabStatus) {
    if (this.destroyed) return;
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // remote-applied update, don't echo
    this.pending.push(update);
    if (this.throttle) return;
    this.throttle = setTimeout(() => {
      const merged = Y.mergeUpdates(this.pending);
      this.pending = [];
      this.throttle = null;
      this.socket.emit(EDITOR_WS_EVENTS.update, { u: toB64(merged) });
    }, 300);
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return;
    const changed = added.concat(updated, removed);
    this.socket.emit(EDITOR_WS_EVENTS.awareness, {
      a: toB64(encodeAwarenessUpdate(this.awareness, changed)),
    });
  };

  private emitAwarenessFull() {
    const ids = Array.from(this.awareness.getStates().keys());
    this.socket.emit(EDITOR_WS_EVENTS.awareness, { a: toB64(encodeAwarenessUpdate(this.awareness, ids)) });
  }

  setLocalUser(field: string, value: unknown) {
    this.awareness.setLocalStateField(field, value);
  }

  destroy() {
    this.destroyed = true;
    if (this.throttle) clearTimeout(this.throttle);
    this.doc.off('update', this.onLocalUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    this.awareness.destroy();
    this.socket.disconnect();
  }
}
