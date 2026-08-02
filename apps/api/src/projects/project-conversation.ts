/**
 * CS-8 R2-1 — the ONE place project membership is written into the project's Discussion thread.
 *
 * The thread IS MC-9's `Conversation { type:'group', projectId }`, and MC-9's own routes
 * (`GET/POST /conversations/:id/messages`) authorize on the `ConversationParticipant` row ALONE.
 * So that row must be written where membership CHANGES, not derived from who happens to open the
 * Discussion tab: round 1 synced it lazily on read, which left a revoked co-author reading and
 * writing the team thread until some *other* member reopened the tab (review BLK-1) and left a new
 * project / a new co-author invisible in the Messages widget (BLK-3).
 *
 * Three seams call in, each inside the transaction that already changes membership:
 *   a. `ProjectsService.create`            → `createProjectConversation`
 *   b. `InvitationsService` accept path    → `setProjectConversationMember(…, 'add')`
 *   c. `MembersService.revokeMember`       → `setProjectConversationMember(…, 'remove')`
 *
 * Plain exported functions taking the Prisma (transaction) client — the same idiom as `isMemberOf`
 * / `assertCanWrite`. A service would need a module edge InvitationsModule → ProjectsModule, and
 * ProjectsModule already imports InvitationsModule (a cycle).
 */

/** The narrow Prisma surface these helpers need — satisfied by PrismaService AND a $transaction tx. */
export type ProjectChatTx = {
  conversation: {
    create(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
  conversationParticipant: {
    createMany(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
};

/** Provision the project's thread with its owner as the first participant (seam a, at creation). */
export async function createProjectConversation(
  tx: ProjectChatTx,
  project: { id: string; title: string; ownerId: string },
): Promise<void> {
  await tx.conversation.create({
    data: {
      type: 'group',
      projectId: project.id,
      name: project.title,
      createdBy: project.ownerId,
      participants: { create: [{ accountId: project.ownerId }] },
    },
  });
}

/**
 * Add or remove ONE account from the project's thread (seams b and c).
 *
 * A project with no thread yet (created before R2-1) is a no-op: `ProjectChatService.findOrCreate`
 * backfills it with the whole member set on first open. `skipDuplicates` keeps the add idempotent,
 * so a re-accepted invite cannot 500 on the composite PK.
 */
export async function setProjectConversationMember(
  tx: ProjectChatTx,
  projectId: string,
  accountId: string,
  action: 'add' | 'remove',
): Promise<void> {
  const conv = await tx.conversation.findUnique({ where: { projectId }, select: { id: true } });
  if (!conv) return;
  if (action === 'add') {
    await tx.conversationParticipant.createMany({
      data: [{ conversationId: conv.id, accountId }],
      skipDuplicates: true,
    });
  } else {
    await tx.conversationParticipant.deleteMany({ where: { conversationId: conv.id, accountId } });
  }
}
