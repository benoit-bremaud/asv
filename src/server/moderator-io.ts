/**
 * Moderator storage seen through the crypto of ADR-0017 (BR-099, `moderation/04`): names, credential ids
 * and public keys reach the store encrypted, looked up by keyed hash; invitation tokens by SHA-256.
 */
import { foldModeratorName, type ModeratorStore, type StoredModerator } from "../domain";
import type { Crypto } from "./crypto/cipher";
import { toBase64Url } from "./crypto/keys";

/** An enrolled moderator in clear. */
export interface Moderator {
  readonly name: string;
  readonly credentialId: string;
  /** COSE public key, base64url. */
  readonly publicKey: string;
  readonly signCount: number;
}

export interface ModeratorIoDeps {
  readonly store: ModeratorStore;
  readonly crypto: Crypto;
}

/** SHA-256 of an invitation token, base64url: the token has 256 random bits, so no key is needed (BR-099). */
export const invitationTokenHash = async (token: string): Promise<string> =>
  toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));

/** Builds the boundary; store and crypto errors propagate. */
export const createModeratorIo = ({ store, crypto }: ModeratorIoDeps) => {
  const nameHash = (name: string) => crypto.keyedHash(`moderator:${foldModeratorName(name)}`);
  const credentialHash = (id: string) => crypto.keyedHash(`credential:${id}`);
  const field = (hash: string, name: string) => `moderator:${hash}:${name}`;

  const toModerator = async (stored: StoredModerator): Promise<Moderator> => ({
    name: await crypto.decrypt(stored.name, field(stored.credentialKeyedHash, "name")),
    credentialId: await crypto.decrypt(stored.credentialId, field(stored.credentialKeyedHash, "credentialId")),
    publicKey: await crypto.decrypt(stored.publicKey, field(stored.credentialKeyedHash, "publicKey")),
    signCount: stored.signCount,
  });

  return {
    async saveInvitation(token: string, name: string, expiresAt: Date): Promise<void> {
      const tokenHash = await invitationTokenHash(token);
      await store.saveInvitation({
        tokenHash,
        nameKeyedHash: await nameHash(name),
        name: await crypto.encrypt(name, `invitation:${tokenHash}`),
        expiresAt,
      });
    },
    /** The invited name, or `undefined` when the token is unknown, used or expired. */
    async invitedName(token: string, now: Date): Promise<string | undefined> {
      const tokenHash = await invitationTokenHash(token);
      const invitation = await store.findInvitation(tokenHash, now);
      return invitation && crypto.decrypt(invitation.name, `invitation:${tokenHash}`);
    },
    /** Consumes the invitation and saves the moderator under its name; false when the invitation is gone. */
    async enroll(token: string, credentialId: string, publicKey: string, signCount: number, now: Date): Promise<string | undefined> {
      const tokenHash = await invitationTokenHash(token);
      const invitation = await store.findInvitation(tokenHash, now);
      if (!invitation) return undefined;
      const name = await crypto.decrypt(invitation.name, `invitation:${tokenHash}`);
      const credentialKeyedHash = await credentialHash(credentialId);
      const saved = await store.enrollModerator(tokenHash, {
        nameKeyedHash: invitation.nameKeyedHash,
        credentialKeyedHash,
        name: await crypto.encrypt(name, field(credentialKeyedHash, "name")),
        credentialId: await crypto.encrypt(credentialId, field(credentialKeyedHash, "credentialId")),
        publicKey: await crypto.encrypt(publicKey, field(credentialKeyedHash, "publicKey")),
        signCount,
      }, now);
      return saved ? name : undefined;
    },
    async byCredential(credentialId: string): Promise<Moderator | undefined> {
      const stored = await store.findByCredential(await credentialHash(credentialId));
      return stored && toModerator(stored);
    },
    updateSignCount: async (credentialId: string, count: number) => store.updateSignCount(await credentialHash(credentialId), count),
    revoke: async (name: string) => store.deleteModerator(await nameHash(name)),
    purgeExpiredInvitations: (now: Date) => store.purgeExpiredInvitations(now),
  };
};

export type ModeratorIo = ReturnType<typeof createModeratorIo>;
