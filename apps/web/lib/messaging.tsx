'use client';

// MC-9 — floating messaging widget: socket.io provider + shared state.
// Connects to the API's socket.io gateway using the ep_session cookie (withCredentials — no token to
// pass). Owns the conversation list, the open thread's messages, typing state, and the panel state,
// so the widget stays a thin view. Also relays the BE-RT1 `unread:changed` signal into the existing
// F-5 UnreadProvider.refresh() so ALL header badges update live (not just messages).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  WS_EVENTS,
  type ConversationItem,
  type MessageDto,
  type WsMessageNew,
  type WsConversationRead,
  type WsTypingServer,
} from '@encre-et-plume/shared';
import * as api from './api';
import { useSession } from './session';
import { useUnreadCounts } from './unread';

const API_ORIGIN =
  (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

const TYPING_EXPIRY_MS = 4000;

// A thread message can be optimistic (pending) or a failed send awaiting retry.
export type ThreadMessage = MessageDto & { pending?: boolean; failed?: boolean; error?: string };

export type PanelState = 'closed' | 'open' | 'minimized';
export type ConnectionState = 'connected' | 'reconnecting';
type MessagesState = 'idle' | 'loading' | 'ready' | 'error';

interface MessagingCtx {
  connected: boolean;
  connectionState: ConnectionState;
  // MC-11: the shared socket.io connection, exposed so the salon dock reuses it (one socket per tab).
  socket: Socket | null;
  conversations: ConversationItem[];
  totalUnread: number;
  conversationsState: 'loading' | 'ready' | 'error';

  panelState: PanelState;
  activeConversationId: string | null;
  activeMessages: ThreadMessage[];
  messagesState: MessagesState;
  hasMoreMessages: boolean;
  // conversationId → true when someone else is typing there
  typing: Record<string, boolean>;

  openWidget: () => void;
  toggleWidget: () => void;
  closeWidget: () => void;
  minimizeWidget: () => void;
  openConversation: (id: string) => void;
  closeThread: () => void;
  openDm: (userId: string) => Promise<void>;
  reloadConversations: () => void;
  loadOlderMessages: () => void;
  sendMessage: (conversationId: string, body: string, attachmentIds?: string[]) => Promise<void>;
  retryMessage: (message: ThreadMessage) => void;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  addConversation: (conversation: ConversationItem) => void;
}

const noop = () => {};

export const MessagingContext = createContext<MessagingCtx>({
  connected: false,
  connectionState: 'connected',
  socket: null,
  conversations: [],
  totalUnread: 0,
  conversationsState: 'loading',
  panelState: 'closed',
  activeConversationId: null,
  activeMessages: [],
  messagesState: 'idle',
  hasMoreMessages: false,
  typing: {},
  openWidget: noop,
  toggleWidget: noop,
  closeWidget: noop,
  minimizeWidget: noop,
  openConversation: noop,
  closeThread: noop,
  openDm: async () => {},
  reloadConversations: noop,
  loadOlderMessages: noop,
  sendMessage: async () => {},
  retryMessage: noop,
  emitTyping: noop,
  addConversation: noop,
});

export const useMessaging = () => useContext(MessagingContext);

// Newest-first API page → oldest-first display list, deduped by id (server echoes my own sends).
function mergeMessage(list: ThreadMessage[], msg: ThreadMessage): ThreadMessage[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = msg;
    return next;
  }
  return [...list, msg];
}

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { account } = useSession();
  const { refresh: refreshUnread } = useUnreadCounts();
  const myId = account?.id ?? null;

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  // MC-11: reactive handle to the socket so the salon dock's subscribe effect re-runs on (re)connect.
  const [socket, setSocket] = useState<Socket | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [conversationsState, setConversationsState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [panelState, setPanelState] = useState<PanelState>('closed');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ThreadMessage[]>([]);
  const [messagesState, setMessagesState] = useState<MessagesState>('idle');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, boolean>>({});

  // Latest values for use inside stable socket handlers without re-subscribing.
  const activeIdRef = useRef<string | null>(null);
  const panelStateRef = useRef<PanelState>('closed');
  activeIdRef.current = activeConversationId;
  panelStateRef.current = panelState;

  // Per-(conversation:user) typing expiry timers.
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reloadConversations = useCallback(() => {
    if (!myId) return;
    setConversationsState('loading');
    api
      .getConversations()
      .then((res) => {
        setConversations(res.items);
        setTotalUnread(res.totalUnread);
        setConversationsState('ready');
      })
      .catch(() => setConversationsState('error'));
  }, [myId]);

  // ── Socket lifecycle: connect only for an authenticated account. ──────────────
  useEffect(() => {
    if (!myId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setConversations([]);
      setTotalUnread(0);
      return;
    }

    reloadConversations();

    const socket = io(API_ORIGIN, { withCredentials: true });
    socketRef.current = socket;
    setSocket(socket);

    socket.on('connect', () => {
      setConnected(true);
      setConnectionState((prev) => {
        // Reconnected after a drop → refetch so we don't miss messages sent while offline.
        if (prev === 'reconnecting') reloadConversations();
        return 'connected';
      });
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setConnectionState('reconnecting');
    });

    socket.on(WS_EVENTS.messageNew, (payload: WsMessageNew) => {
      const { conversationId, message } = payload;
      const isMine = message.senderId === myId;
      const isActiveOpen =
        activeIdRef.current === conversationId && panelStateRef.current === 'open';

      if (isActiveOpen) {
        setActiveMessages((list) => mergeMessage(list, message));
        // Reading it now — keep it read server-side + locally.
        if (!isMine) void api.markConversationRead(conversationId).catch(() => {});
      }

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        const bumpsUnread = !isMine && !isActiveOpen;
        if (idx < 0) {
          // Unknown conversation (e.g. first DM someone starts with me) → refetch the list.
          reloadConversations();
          return prev;
        }
        const conv = prev[idx];
        const updated: ConversationItem = {
          ...conv,
          lastMessage: {
            body: message.body || payload.senderName,
            senderName: payload.senderName,
            createdAt: message.createdAt,
          },
          lastMessageAt: message.createdAt,
          unreadCount: bumpsUnread ? conv.unreadCount + 1 : conv.unreadCount,
        };
        const rest = prev.filter((c) => c.id !== conversationId);
        return [updated, ...rest];
      });
      if (!isMine && !isActiveOpen) setTotalUnread((n) => n + 1);

      refreshUnread();
    });

    socket.on(WS_EVENTS.conversationRead, (payload: WsConversationRead) => {
      if (payload.userId === myId) return;
      // Mark my messages as read by that participant (drives the "Lu" line).
      setActiveMessages((list) =>
        activeIdRef.current === payload.conversationId
          ? list.map((m) =>
              m.readBy.includes(payload.userId) ? m : { ...m, readBy: [...m.readBy, payload.userId] },
            )
          : list,
      );
    });

    socket.on(WS_EVENTS.typing, (payload: WsTypingServer) => {
      if (payload.userId === myId) return;
      const key = `${payload.conversationId}:${payload.userId}`;
      if (typingTimers.current[key]) clearTimeout(typingTimers.current[key]);
      if (payload.isTyping) {
        setTyping((t) => ({ ...t, [payload.conversationId]: true }));
        typingTimers.current[key] = setTimeout(() => {
          delete typingTimers.current[key];
          setTyping((t) => ({ ...t, [payload.conversationId]: false }));
        }, TYPING_EXPIRY_MS);
      } else {
        setTyping((t) => ({ ...t, [payload.conversationId]: false }));
      }
    });

    // BE-RT1: any F-5 notification (connection requests, applications, invitations, messages…) →
    // a payload-less "refetch now" nudge. The counts still come from the REST source of truth.
    socket.on(WS_EVENTS.unreadChanged, () => {
      refreshUnread();
    });

    const timers = typingTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // ── Thread loading ────────────────────────────────────────────────────────────
  const loadThread = useCallback(
    (conversationId: string) => {
      setMessagesState('loading');
      setActiveMessages([]);
      setNextCursor(null);
      api
        .getMessages(conversationId)
        .then((page) => {
          // API is newest-first; the thread renders oldest→newest.
          setActiveMessages([...page.items].reverse());
          setNextCursor(page.nextCursor);
          setMessagesState('ready');
        })
        .catch(() => setMessagesState('error'));
    },
    [],
  );

  const markRead = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (conv && conv.unreadCount > 0) setTotalUnread((n) => Math.max(0, n - conv.unreadCount));
      return prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c));
    });
    void api.markConversationRead(conversationId).then(refreshUnread).catch(() => {});
  }, [refreshUnread]);

  const openConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      setPanelState('open');
      loadThread(id);
      markRead(id);
    },
    [loadThread, markRead],
  );

  const loadOlderMessages = useCallback(() => {
    const id = activeConversationId;
    if (!id || !nextCursor) return;
    api
      .getMessages(id, nextCursor)
      .then((page) => {
        setActiveMessages((list) => [...[...page.items].reverse(), ...list]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {});
  }, [activeConversationId, nextCursor]);

  const addConversation = useCallback((conversation: ConversationItem) => {
    setConversations((prev) =>
      prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev],
    );
  }, []);

  const openDm = useCallback(
    async (userId: string) => {
      setPanelState('open');
      try {
        const conv = await api.createConversation({ participantId: userId });
        addConversation(conv);
        setActiveConversationId(conv.id);
        loadThread(conv.id);
        markRead(conv.id);
      } catch {
        // Leave the list open; the failure surfaces via the list panel.
      }
    },
    [addConversation, loadThread, markRead],
  );

  const doSend = useCallback(
    async (conversationId: string, tempId: string, body: string, attachmentIds?: string[]) => {
      try {
        const real = await api.sendMessage(conversationId, {
          ...(body ? { body } : {}),
          ...(attachmentIds && attachmentIds.length
            ? { attachments: attachmentIds.map((mediaId) => ({ mediaId })) }
            : {}),
        });
        setActiveMessages((list) => mergeMessage(list.filter((m) => m.id !== tempId), real));
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId);
          if (idx < 0) return prev;
          const conv = {
            ...prev[idx],
            lastMessage: {
              body: real.body || real.attachments[0]?.name || '',
              senderName: account?.displayName ?? '',
              createdAt: real.createdAt,
            },
            lastMessageAt: real.createdAt,
          };
          return [conv, ...prev.filter((c) => c.id !== conversationId)];
        });
      } catch (e) {
        // Surface the server's neutral message (e.g. MC-10 block: "Impossible d'envoyer le message.")
        // without ever disclosing a block. Falls back to the generic label.
        const msg = (e as { message?: string } | null)?.message;
        setActiveMessages((list) =>
          list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true, error: msg } : m)),
        );
      }
    },
    [account?.displayName],
  );

  const sendMessage = useCallback(
    async (conversationId: string, body: string, attachmentIds?: string[]) => {
      const trimmed = body.trim();
      if (!trimmed && !(attachmentIds && attachmentIds.length)) return;
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: ThreadMessage = {
        id: tempId,
        conversationId,
        senderId: myId ?? '',
        body: trimmed,
        attachments: [],
        createdAt: new Date().toISOString(),
        readBy: [],
        pending: true,
      };
      setActiveMessages((list) => [...list, optimistic]);
      await doSend(conversationId, tempId, trimmed, attachmentIds);
    },
    [doSend, myId],
  );

  const retryMessage = useCallback(
    (message: ThreadMessage) => {
      if (!message.failed) return;
      setActiveMessages((list) =>
        list.map((m) => (m.id === message.id ? { ...m, failed: false, pending: true } : m)),
      );
      void doSend(message.conversationId, message.id, message.body);
    },
    [doSend],
  );

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit(WS_EVENTS.typing, { conversationId, isTyping });
  }, []);

  const openWidget = useCallback(() => setPanelState('open'), []);
  const toggleWidget = useCallback(
    () => setPanelState((s) => (s === 'open' ? 'closed' : 'open')),
    [],
  );
  const minimizeWidget = useCallback(() => setPanelState('minimized'), []);
  const closeWidget = useCallback(() => {
    setPanelState('closed');
    setActiveConversationId(null);
    setActiveMessages([]);
    setMessagesState('idle');
  }, []);
  const closeThread = useCallback(() => {
    setActiveConversationId(null);
    setActiveMessages([]);
    setMessagesState('idle');
  }, []);

  return (
    <MessagingContext.Provider
      value={{
        connected,
        connectionState,
        socket,
        conversations,
        totalUnread,
        conversationsState,
        panelState,
        activeConversationId,
        activeMessages,
        messagesState,
        hasMoreMessages: nextCursor != null,
        typing,
        openWidget,
        toggleWidget,
        closeWidget,
        minimizeWidget,
        openConversation,
        closeThread,
        openDm,
        reloadConversations,
        loadOlderMessages,
        sendMessage,
        retryMessage,
        emitTyping,
        addConversation,
      }}
    >
      {children}
    </MessagingContext.Provider>
  );
}
