/**
 * Moderator stores of the Node transport (BR-099, `moderation/04`): values arrive encrypted or hashed. The
 * memory store serves development and tests; the file store keeps it in one JSON file (0600), rewritten
 * through a temporary file and a rename after every change, so enrolled moderators survive a restart.
 */
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { ModeratorStore, StoredInvitation, StoredModerator } from "../../domain";

interface Snapshot {
  readonly moderators: StoredModerator[];
  readonly invitations: StoredInvitation[];
}

/** In memory; `onChange` runs after every write, with what is stored. */
export const createMemoryModeratorStore = (
  initial: Snapshot = { moderators: [], invitations: [] },
  onChange: (snapshot: Snapshot) => void = () => undefined,
): ModeratorStore & { dump(): Snapshot } => {
  const moderators = new Map(initial.moderators.map((moderator) => [moderator.nameKeyedHash, moderator]));
  const invitations = new Map(initial.invitations.map((invitation) => [invitation.tokenHash, invitation]));
  const dump = (): Snapshot => ({ moderators: [...moderators.values()], invitations: [...invitations.values()] });
  const changed = () => {
    onChange(dump());
    return Promise.resolve();
  };
  const valid = (tokenHash: string, now: Date) => {
    const invitation = invitations.get(tokenHash);
    return invitation && invitation.expiresAt.getTime() > now.getTime() ? invitation : undefined;
  };
  const byCredential = (hash: string) => [...moderators.values()].find((moderator) => moderator.credentialKeyedHash === hash);
  return {
    saveInvitation(invitation) {
      invitations.set(invitation.tokenHash, invitation);
      return changed();
    },
    findInvitation: (tokenHash, now) => Promise.resolve(valid(tokenHash, now)),
    async consumeInvitation(tokenHash, now) {
      const invitation = valid(tokenHash, now);
      if (invitation) {
        invitations.delete(tokenHash);
        await changed();
      }
      return invitation;
    },
    saveModerator(moderator) {
      moderators.set(moderator.nameKeyedHash, moderator);
      return changed();
    },
    findByCredential: (hash) => Promise.resolve(byCredential(hash)),
    async updateSignCount(hash, count) {
      const moderator = byCredential(hash);
      if (!moderator) return;
      moderators.set(moderator.nameKeyedHash, { ...moderator, signCount: count });
      await changed();
    },
    async deleteModerator(nameKeyedHash) {
      const found = moderators.delete(nameKeyedHash);
      const pending = [...invitations.values()].filter((invitation) => invitation.nameKeyedHash === nameKeyedHash);
      for (const invitation of pending) invitations.delete(invitation.tokenHash);
      if (found || pending.length > 0) await changed();
      return found || pending.length > 0;
    },
    async purgeExpiredInvitations(now) {
      const expired = [...invitations.values()].filter((invitation) => invitation.expiresAt.getTime() <= now.getTime());
      for (const invitation of expired) invitations.delete(invitation.tokenHash);
      if (expired.length > 0) await changed();
    },
    dump,
  };
};

const write = (path: string, snapshot: Snapshot) => {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, "w", 0o600);
  try {
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
