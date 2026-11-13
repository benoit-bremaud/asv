/**
 * Brick 8b moderator operations (`moderation/02f`, `platform/04c`): WebAuthn challenges, single use and kept
 * 5 minutes, 200 pending at most (BR-096), around the encrypted moderator store (BR-099).
 */
import { MODERATOR_LIMITS } from "../domain";
import type { ModeratorIo } from "./moderator-io";

/** Registration challenges belong to one invitation token; authentication ones to nobody yet. */
export type ChallengePurpose = { readonly kind: "register"; readonly token: string } | { readonly kind: "authenticate" };

interface Pending {
  readonly purpose: ChallengePurpose;
  readonly expiresAt: number;
}

/** Builds the operations; `io` errors propagate to the routes, which answer 503. */
export const createModeratorOps = (io: ModeratorIo) => {
  const challenges = new Map<string, Pending>();

  const sweep = (nowMs: number) => {
    for (const [challenge, pending] of challenges) if (pending.expiresAt <= nowMs) challenges.delete(challenge);
  };

  return {
    io,
    /** Keeps `challenge`; false when 200 are already pending (BR-096). */
    keepChallenge(challenge: string, purpose: ChallengePurpose, now: Date): boolean {
      sweep(now.getTime());
      if (challenges.size >= MODERATOR_LIMITS.maxPendingChallenges) return false;
      challenges.set(challenge, { purpose, expiresAt: now.getTime() + MODERATOR_LIMITS.challengeTtlMs });
      return true;
    },
    /** Consumes `challenge` if it is pending, unexpired and of that purpose (same token for a registration). */
    takeChallenge(challenge: string, purpose: ChallengePurpose, now: Date): boolean {
      const pending = challenges.get(challenge);
      if (!pending) return false;
      challenges.delete(challenge);
      if (pending.expiresAt <= now.getTime() || pending.purpose.kind !== purpose.kind) return false;
      return pending.purpose.kind === "authenticate" || (purpose.kind === "register" && pending.purpose.token === purpose.token);
    },
    async createInvitation(name: string, token: string, now: Date): Promise<void> {
      await io.saveInvitation(token, name, new Date(now.getTime() + MODERATOR_LIMITS.invitationTtlMs));
    },
    /** Hub tick: expired invitations and challenges. */
    async purge(now: Date): Promise<void> {
      sweep(now.getTime());
      await io.purgeExpiredInvitations(now);
    },
  };
};

export type ModeratorOps = ReturnType<typeof createModeratorOps>;
