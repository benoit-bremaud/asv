import {
  ACCOUNT_LIMITS,
  type AccountStore,
  type CodeCounts,
  type DeviceRecord,
  type LegalVaultStore,
  type StoredAccount,
  type StoredCode,
  type VaultEntry,
} from "../../domain";

interface Issued {
  readonly emailKeyedHash: string;
  readonly ipKeyedHash: string;
  readonly at: Date;
}

/**
 * In-memory account store of the Node transport (ADR-0017 scope): values arrive already encrypted or
 * hashed, and die with the process. Brick 9 adds the Durable Object SQLite twin.
 */
export const createMemoryAccountStore = (): AccountStore & {
  /** Test hook: what is stored, to check nothing is in clear. */
  dump(): { accounts: StoredAccount[]; codes: StoredCode[]; devices: DeviceRecord[] };
  /** Moderation writes blocks in brick 8; tests add them here. */
  block(emailKeyedHash: string, until: Date): void;
} => {
  const codes = new Map<string, StoredCode>();
  const accounts = new Map<string, StoredAccount>();
  const devices = new Map<string, DeviceRecord>();
  const blocks = new Map<string, Date>();
  const carryOvers = new Map<string, readonly Date[]>();
  let issued: Issued[] = [];
  let wrongTries: { readonly emailKeyedHash: string; readonly at: Date }[] = [];
  const byEmailHash = (hash: string) => [...accounts.values()].find((account) => account.emailKeyedHash === hash);

  return {
    saveCode: async (code) => void codes.set(code.sessionId, code),
    loadCode: async (sessionId) => codes.get(sessionId),
    deleteCode: async (sessionId) => void codes.delete(sessionId),
    recordCodeIssued: async (emailKeyedHash, ipKeyedHash, at) => void issued.push({ emailKeyedHash, ipKeyedHash, at }),
    recordWrongTry: async (emailKeyedHash, at) => void wrongTries.push({ emailKeyedHash, at }),
    async codeCounts(emailKeyedHash, ipKeyedHash, now): Promise<CodeCounts> {
      const since = now.getTime() - ACCOUNT_LIMITS.quotaWindowMs;
      const daySince = now.getTime() - ACCOUNT_LIMITS.wrongTryWindowMs;
      const recent = issued.filter((entry) => entry.at.getTime() > since);
      const forEmail = recent.filter((entry) => entry.emailKeyedHash === emailKeyedHash);
      return {
        email: forEmail.length,
        ip: recent.filter((entry) => entry.ipKeyedHash === ipKeyedHash).length,
        lastEmailCodeAt: forEmail.at(-1)?.at,
        wrongTries: wrongTries.filter((entry) => entry.emailKeyedHash === emailKeyedHash && entry.at.getTime() > daySince).length,
      };
    },
    findAccountByEmailHash: async (hash) => byEmailHash(hash),
    findAccountById: async (accountId) => accounts.get(accountId),
    saveAccount: async (account) => void accounts.set(account.id, account),
    deleteAccount: async (accountId) => void accounts.delete(accountId),
    saveDevice: async (device) => void devices.set(device.tokenHash, device),
    async accountForDevice(tokenHash, now) {
      const device = devices.get(tokenHash);
      return device && device.expiresAt.getTime() > now.getTime() ? accounts.get(device.accountId) : undefined;
    },
    deleteDevice: async (tokenHash) => void devices.delete(tokenHash),
    async deleteAllDevices(accountId) {
      for (const [hash, device] of devices) if (device.accountId === accountId) devices.delete(hash);
    },
    isBlocked: async (hash, now) => (blocks.get(hash)?.getTime() ?? 0) > now.getTime(),
    loadCarryOver: async (hash) => carryOvers.get(hash),
    saveCarryOver: async (hash, expiries) => void carryOvers.set(hash, expiries),
    deleteCarryOver: async (hash) => void carryOvers.delete(hash),
    async purgeExpired(now) {
      const time = now.getTime();
      for (const [key, code] of codes) if (code.expiresAt.getTime() <= time) codes.delete(key);
      for (const [key, device] of devices) if (device.expiresAt.getTime() <= time) devices.delete(key);
      for (const [key, until] of blocks) if (until.getTime() <= time) blocks.delete(key);
      for (const [key, expiries] of carryOvers) if (expiries.every((at) => at.getTime() <= time)) carryOvers.delete(key);
      issued = issued.filter((entry) => entry.at.getTime() > time - ACCOUNT_LIMITS.quotaWindowMs);
      wrongTries = wrongTries.filter((entry) => entry.at.getTime() > time - ACCOUNT_LIMITS.wrongTryWindowMs);
    },
    dump: () => ({ accounts: [...accounts.values()], codes: [...codes.values()], devices: [...devices.values()] }),
    block: (hash, until) => void blocks.set(hash, until),
  };
};

/** In-memory legal vault (ADR-0014): write-only for the application, `entries()` exists for tests only. */
export const createMemoryVault = (): LegalVaultStore & { entries(): readonly VaultEntry[] } => {
  let entries: VaultEntry[] = [];
  return {
    record: async (entry) => void entries.push(entry),
    async purgeExpired(now) {
      const time = now.getTime();
      entries = entries
        .filter((entry) => entry.closedAt.getTime() + ACCOUNT_LIMITS.vaultRetentionMs > time)
        .map((entry) => (entry.closedAt.getTime() + ACCOUNT_LIMITS.vaultIdentityMs > time ? entry : { ...entry, accountId: "" }));
    },
    entries: () => [...entries],
  };
};
