'use client';

// MC-15 — the two behaviours every message surface shares, defined once so the widget, the salon
// dock and the project Discussion cannot drift: the optimistic like toggle and the jump-to-original.
import { useCallback } from 'react';
import { likeMessage, unlikeMessage } from './api';

/** The like fields any surface's message row carries (MessageDto and SalonMessageDto both do). */
export interface LikeableMessage {
  id: string;
  likeCount: number;
  likedByMe: boolean;
}

/**
 * Optimistic like/unlike with reconciliation: flip the heart instantly, then let the server decide.
 * A refusal puts the ORIGINAL count and state back — never a half-applied like.
 * `patch` is the surface's own state updater (each holds its list differently).
 */
export function useLikeToggle(
  patch: (id: string, fields: { likeCount: number; likedByMe: boolean }) => void,
) {
  return useCallback(
    async (message: LikeableMessage, next?: boolean) => {
      const liked = next ?? !message.likedByMe;
      if (liked === message.likedByMe) return; // double-click on an already-liked bubble: no-op
      patch(message.id, {
        likedByMe: liked,
        likeCount: Math.max(0, message.likeCount + (liked ? 1 : -1)),
      });
      try {
        await (liked ? likeMessage(message.id) : unlikeMessage(message.id));
      } catch {
        patch(message.id, { likedByMe: message.likedByMe, likeCount: message.likeCount });
      }
    },
    [patch],
  );
}

/**
 * Scroll a quoted message into view and flash it. Returns false when the original is not in the
 * loaded page, so the caller can say so instead of pretending the jump worked.
 * ponytail: a CSS class + one timer, no animation library.
 */
export function jumpToMessage(root: HTMLElement | Document | null, messageId: string): boolean {
  const scope = root ?? document;
  const el = scope.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('ep-message-jump');
  window.setTimeout(() => el.classList.remove('ep-message-jump'), 1400);
  return true;
}

/**
 * A double-click on a bubble likes it — but not when it lands on a control or a link inside the
 * bubble (the "…" trigger, the heart, an attachment link), which would fire two behaviours at once.
 */
export function isPlainBubbleTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !el?.closest?.('button, a, input, textarea, [role="menu"]');
}
