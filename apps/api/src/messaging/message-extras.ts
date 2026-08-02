import type { MessageActionFields, MessageReplyRef } from '@encre-et-plume/shared';
import { MESSAGE_EXCERPT_MAX } from '@encre-et-plume/shared';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * What this loader derives. `editedAt` is NOT here: it is a column on the row itself, so each read
 * path reads it directly instead of round-tripping it through a lookup.
 */
export type MessageExtras = Omit<MessageActionFields, 'editedAt'>;

/** The columns a read path must select for MC-15 to decorate a row. */
export interface ExtrasSource {
  id: string;
  replyToId?: string | null;
  replyToDeleted?: boolean | null;
}

/** A message whose quote target is gone (D-3): the quote still renders, as « Message supprimé ». */
export const DELETED_REPLY: MessageReplyRef = {
  id: '',
  senderId: '',
  senderName: '',
  excerpt: '',
  deleted: true,
};

/**
 * MC-15 — likes + resolved quotes for a WHOLE page of messages, in a fixed number of queries.
 *
 * One `Message` table backs the MC-9 widget, the MC-11 salon and the CS-8 project thread, so this is
 * the ONE place that derives `likeCount` / `likedByMe` / `replyTo`; `MessagesService` and
 * `SalonService` both call it and their two DTOs stay separate façades over the same fact.
 *
 * Cost is 2 queries per page, never one per message: all the page's like rows in one `findMany`
 * (counted + matched against the viewer in memory) and all the quoted parents in one more.
 * ponytail: fetching the raw like rows instead of a groupBy + a "my likes" query is one query fewer
 * and enough at a page of ≤100 messages; switch to a groupBy if a single message ever collects
 * thousands of likes.
 */
export async function loadMessageExtras(
  prisma: PrismaService,
  rows: ExtrasSource[],
  viewerId: string,
): Promise<Map<string, MessageExtras>> {
  const extras = new Map<string, MessageExtras>();
  if (rows.length === 0) return extras;

  const ids = rows.map((r) => r.id);
  const parentIds = [...new Set(rows.map((r) => r.replyToId).filter((id): id is string => !!id))];

  const [likes, parents] = await Promise.all([
    prisma.messageLike.findMany({
      where: { messageId: { in: ids } },
      select: { messageId: true, accountId: true },
    }) as Promise<{ messageId: string; accountId: string }[]>,
    parentIds.length > 0
      ? (prisma.message.findMany({
          where: { id: { in: parentIds } },
          select: {
            id: true,
            senderId: true,
            body: true,
            attachments: true,
            sender: { select: { displayName: true } },
          },
        }) as Promise<ParentRow[]>)
      : Promise.resolve([] as ParentRow[]),
  ]);

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const like of likes) {
    counts.set(like.messageId, (counts.get(like.messageId) ?? 0) + 1);
    if (like.accountId === viewerId) mine.add(like.messageId);
  }
  const parentById = new Map(parents.map((p) => [p.id, p]));

  for (const row of rows) {
    extras.set(row.id, {
      likeCount: counts.get(row.id) ?? 0,
      likedByMe: mine.has(row.id),
      replyTo: resolveReply(row, parentById),
    });
  }
  return extras;
}

interface ParentRow {
  id: string;
  senderId: string;
  body: string;
  attachments: unknown;
  sender?: { displayName: string } | null;
}

function resolveReply(row: ExtrasSource, parents: Map<string, ParentRow>): MessageReplyRef | null {
  if (row.replyToId) {
    const parent = parents.get(row.replyToId);
    // The pointer survived but the row did not (a hand-deleted parent): still a deleted quote.
    return parent ? toReplyRef(parent) : DELETED_REPLY;
  }
  // `onDelete: SetNull` nulled the pointer — `replyToDeleted` is what remembers there WAS a quote.
  return row.replyToDeleted ? DELETED_REPLY : null;
}

/** Build the quote a reply renders above its own body. Truncated server-side — no client re-derives it. */
export function toReplyRef(parent: ParentRow): MessageReplyRef {
  const attachments = Array.isArray(parent.attachments)
    ? (parent.attachments as { name?: string }[])
    : [];
  const source = parent.body?.trim() || attachments[0]?.name || '';
  return {
    id: parent.id,
    senderId: parent.senderId,
    senderName: parent.sender?.displayName ?? '',
    excerpt: source.slice(0, MESSAGE_EXCERPT_MAX),
    deleted: false,
  };
}
