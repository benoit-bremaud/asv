/**
 * Moderator stores of the Node transport (BR-099, `moderation/04`): values arrive encrypted or hashed. The
 * memory store serves development and tests; the file store keeps it in one JSON file (0600), rewritten
 * through a temporary file and a rename after every change, so enrolled moderators survive a restart.
 */
import { chmodSync, closeSync, fchmodSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { ModeratorStore, StoredInvitation, StoredModerator } from "../../domain";

interface Snapshot {
  readonly moderators: StoredModerator[];
  readonly invitations: StoredInvitation[];
}

/**
 * In memory; `onChange` gets the next snapshot before it is kept, so a failed write (disk full, EACCES)
 * leaves memory as it was and both stay in step.
 */
export const createMemoryModeratorStore = (
  initial: Snapshot = { moderators: [], invitations: [] },
  onChange: (snapshot: Snapshot) => void = () => undefined,
): ModeratorStore & { dump(): Snapshot } => {
  let moderators = new Map(initial.moderators.map((moderator) => [moderator.nameKeyedHash, moderator]));
  let invitations = new Map(initial.invitations.map((invitation) => [invitation.tokenHash, invitation]));
  const dump = (): Snapshot => ({ moderators: [...moderators.values()], invitations: [...invitations.values()] });
  /** Applies `change` to copies, writes them, then keeps them. */
  const commit = (change: (nextModerators: typeof moderators, nextInvitations: typeof invitations) => void) => {
    const nextModerators = new Map(moderators);
    const nextInvitations = new Map(invitations);
    change(nextModerators, nextInvitations);
    onChange({ moderators: [...nextModerators.values()], invitations: [...nextInvitations.values()] });
    moderators = nextModerators;
    invitations = nextInvitations;
  };
  const valid = (tokenHash: string, now: Date) => {
    const invitation = invitations.get(tokenHash);
    return invitation && invitation.expiresAt.getTime() > now.getTime() ? invitation : undefined;
  };
  const byCredential = (hash: string) => [...moderators.values()].find((moderator) => moderator.credentialKeyedHash === hash);
  return {
    async saveInvitation(invitation) {
      commit((_, next) => next.set(invitation.tokenHash, invitation));
    },
    findInvitation: (tokenHash, now) => Promise.resolve(valid(tokenHash, now)),
    async enrollModerator(tokenHash, moderator, now) {
      if (!valid(tokenHash, now)) return false;
      commit((nextModerators, nextInvitations) => {
        nextInvitations.delete(tokenHash);
        nextModerators.set(moderator.nameKeyedHash, moderator);
      });
      return true;
    },
    findByCredential: (hash) => Promise.resolve(byCredential(hash)),
    async updateSignCount(hash, count) {
      const moderator = byCredential(hash);
      if (moderator) commit((next) => next.set(moderator.nameKeyedHash, { ...moderator, signCount: count }));
    },
    async deleteModerator(nameKeyedHash) {
      const pending = [...invitations.values()].filter((invitation) => invitation.nameKeyedHash === nameKeyedHash);
      const found = moderators.has(nameKeyedHash);
      if (!found && pending.length === 0) return false;
      commit((nextModerators, nextInvitations) => {
        nextModerators.delete(nameKeyedHash);
        for (const invitation of pending) nextInvitations.delete(invitation.tokenHash);
      });
      return true;
    },
    async purgeExpiredInvitations(now) {
      const expired = [...invitations.values()].filter((invitation) => invitation.expiresAt.getTime() <= now.getTime());
      if (expired.length > 0) commit((_, next) => { for (const invitation of expired) next.delete(invitation.tokenHash); });
    },
    dump,
  };
};

const write = (path: string, snapshot: Snapshot) => {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, "w", 0o600);
  try {
    // `openSync` sets the mode only on creation: a leftover temporary file keeps its own otherwise.
    fchmodSync(fd, 0o600);
    writeSync(fd, JSON.stringify(snapshot));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
};

const read = (path: string): Snapshot => {
  if (!existsSync(path)) return { moderators: [], invitations: [] };
  chmodSync(path, 0o600);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { moderators?: StoredModerator[]; invitations?: (Omit<StoredInvitation, "expiresAt"> & { expiresAt: string })[] };
  return {
    moderators: parsed.moderators ?? [],
    invitations: (parsed.invitations ?? []).map((invitation) => ({ ...invitation, expiresAt: new Date(invitation.expiresAt) })),
  };
};

/** File-backed store; an unreadable file stops the start rather than losing moderators. */
export const createFileModeratorStore = (path: string): ModeratorStore & { dump(): Snapshot } => {
  // Only a folder created here is set to 0700: an existing, possibly shared folder is left as it is.
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  return createMemoryModeratorStore(read(path), (snapshot) => write(path, snapshot));
};
