# PUB-4 — Follow a creator

**As a** Reader, **I want** to follow a creator, **so that** I get notified when they publish and build a feed of the creators I care about.

> Screen(s): Creator profile ([[F-3]]), work team member, illustration artist — "Suivre" / "＋ Suivre" · Priority: Should · Fidelity: Explicit

## Frontend
- "Suivre" / "＋ Suivre" button on:
  - Creator profile ([[F-3]]).
  - Work page team/credits (per team member).
  - Illustration detail artist ([[DR-6]]).
- Toggles to a followed state ("Suivi·e ✓" / "Ne plus suivre" on hover) when active.
- Followers count displayed on profile ([[F-3]]), updates on follow/unfollow.
- Visitor sees "Suivre" but is prompted to sign in on click ([[F-1]]).
- States:
  - Loading: button disabled with spinner during request.
  - Optimistic toggle + count adjustment; revert on error with toast.
  - Self: no follow button on own profile.
- Validation: cannot follow self.
- Accessibility: button exposes pressed/followed state; accessible name reflects action ("Suivre <nom>" / "Ne plus suivre <nom>"); count is text.

## Backend
- **POST /follows** — `{ creatorId }` (followerId = authenticated user). Idempotent: re-following is a no-op success.
- **DELETE /follows** — `{ creatorId }`. Idempotent: unfollowing when not following is a no-op success.
- **GET /creators/{id}/followers** (count + optionally list) and viewer's `isFollowing` flag.
- Entity **Follow**: `followerId, creatorId, createdAt` (unique pair).
- Business rules:
  - Cannot follow self.
  - Maintain follower/following counters on profiles ([[F-3]]).
  - Follow graph is the source for the publish-notification audience ([[PUB-1]], [[F-5]]) and a content feed source.
- Validation: `creatorId` exists and is not the follower.
- Authorization: authenticated user only ([[F-1]]).
- Side effects: counter updates; feed/notification subscription established.

## Dependencies
- [[F-1]] — auth to follow.
- [[F-3]] — profile hosts button + followers count.
- [[DR-6]] — illustration artist follow entry point.
- [[PUB-1]], [[F-5]] — followers receive publish notifications.

## Notes
- Explicit: "Suivre" / "＋ Suivre" on profiles, work team, and illustration artist; followers count on profile; followers receive publish notifications.
- Inferred: optimistic toggle, followed-state label, self-follow guard, feed-source role.
