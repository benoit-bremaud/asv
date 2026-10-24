/**
 * Account commands of the hub (`platform/04c`, `platform/04d`, issue #36): UC17 to UC19 over the WebSocket.
 * A failed store call answers `warning unavailable` and changes nothing in memory.
 */
import {
  checkCode,
  closeAccount,
  decideCodeRequest,
  linkAccount,
  normaliseEmail,
  unlinkSessions,
  type CodeRandom,
  type HubState,
  type Mailer,
  type SessionFilter,
} from "../domain";
import type { AccountIo } from "./account-io";
import type { ClientMessage } from "../shared/protocol";
import { sessionOf, type Outgoing, type OutgoingModule } from "./outgoing";

type Command<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;

/** The socket asking, as the account handlers see it. */
export interface Caller {
  readonly key: string;
  /** Key of the per-IP code quota (BR-071). */
  readonly ip: string;
  readonly sessionId: string;
}

/** The hub dependencies the account commands use (the subset of `HubDeps`). */
export interface AccountDeps {
  readonly random: CodeRandom;
  readonly accounts: AccountIo;
  readonly mailer: Mailer;
  readonly onStoreError: (error: unknown) => void;
}

/** What the account handlers share with the hub. */
export interface HubContext {
  readonly deps: AccountDeps;
  readonly out: OutgoingModule;
  state(): HubState;
  /** Commits a new state; called only once every store write of the command succeeded. */
  setState(next: HubState): void;
}

type AccountHandler<T extends ClientMessage["type"]> = (caller: Caller, command: Command<T>, now: Date) => Promise<Outgoing[]>;

/**
 * One handler per account command for the hub's handler map, plus `unlink` for `signOutDevice`. A handler
 * never rejects: a store failure becomes `warning unavailable` and leaves memory untouched.
 */
export const createAccountHandlers = (ctx: HubContext) => {
  const { deps, out } = ctx;

  /** Unlinks the matching sessions and tells their sockets (UC18, UC19). */
  const unlink = (filter: SessionFilter): Outgoing[] => {
    const result = unlinkSessions(ctx.state(), filter);
    ctx.setState(result.state);
    const to = out.keysOf(result.unlinked);
    return to.length > 0 ? [out.send(to, "accountUnlinked", {})] : [];
  };

  /** UC17 steps 1–3 (`accounts/02`): refusals are explicit only when they reveal nothing about the address. */
  const onRequestCode: AccountHandler<"requestCode"> = async (caller, command, now) => {
    const email = normaliseEmail(command.payload.email);
    // An invalid address never reaches the store.
    if (email === undefined) return [out.warning(caller.key, "emailInvalid", command.seq)];
    const { facts, emailKeyedHash, ipKeyedHash } = await deps.accounts.codeFacts(email, caller.ip, now);
    const decision = decideCodeRequest(facts, now, deps.random);
    if (decision.kind === "refused") return [out.warning(caller.key, decision.reason, command.seq)];
    if (decision.kind === "issue") {
      await deps.accounts.saveIssued({
        sessionId: caller.sessionId,
        email,
        emailKeyedHash,
        ipKeyedHash,
        code: decision.code,
        remember: command.payload.remember,
        expiresAt: decision.expiresAt,
        now,
      });
      // Not awaited: the answer must not depend on the provider (ADR-0013 amendment).
      void deps.mailer.sendCode(email, decision.code).catch(deps.onStoreError);
    }
    return [out.send([caller.key], "codeSent", {})];
  };

  /** UC17 steps 4–6. */
  const onVerifyCode: AccountHandler<"verifyCode"> = async (caller, command, now) => {
    const pending = await deps.accounts.loadPending(caller.sessionId);
    if (!pending) return [out.warning(caller.key, "codeMissing", command.seq)];
    const check = checkCode(pending.stored, await deps.accounts.codeMatches(pending, command.payload.code), now);
    if (check.kind === "refused") {
      if (check.reason !== "expired") await deps.accounts.recordWrongTry(pending, now);
      if (check.reason === "wrong") {
        await deps.accounts.saveTries(pending, check.triesLeft);
        return [out.send([caller.key], "warning", { code: "codeWrong", message: "codeWrong", replyTo: command.seq, triesLeft: check.triesLeft })];
      }
      await deps.accounts.deleteCode(caller.sessionId);
      return [out.warning(caller.key, check.reason === "expired" ? "codeExpired" : "codeExhausted", command.seq)];
    }
    const facts = await deps.accounts.linkFacts(pending, now);
    const result = linkAccount(ctx.state(), {
      sessionId: caller.sessionId,
      email: pending.email,
      remember: pending.stored.remember,
      blocked: facts.blocked,
      existing: facts.existing,
      carryOver: facts.carryOver,
    }, now, deps.random);
    await deps.accounts.deleteCode(caller.sessionId);
    if (result.kind === "refused") return [out.warning(caller.key, result.reason, command.seq)];
    await deps.accounts.saveAccount(result.account, facts.emailKeyedHash, result.created);
    ctx.setState(result.state);
    return [out.send([caller.key], "accountLinked", {
      accountId: result.account.id,
      ...(result.deviceClaim ? { deviceClaim: result.deviceClaim } : {}),
    })];
  };

  /** UC18 "everywhere" and UC19 share this: the caller must be signed in, then its sessions are unlinked. */
  const accountWide = async (caller: Caller, replyTo: number, act: (accountId: string) => Promise<void>): Promise<Outgoing[]> => {
    const accountId = sessionOf(ctx.state(), caller.sessionId).accountId;
    if (!accountId) return [out.warning(caller.key, "notSignedIn", replyTo)];
    await act(accountId);
    return unlink({ by: "account", accountId });
  };

  const onSignOutEverywhere: AccountHandler<"signOutEverywhere"> = (caller, command) =>
    accountWide(caller, command.seq, (accountId) => deps.accounts.deleteAllDevices(accountId));

  const onDeleteAccount: AccountHandler<"deleteAccount"> = (caller, command, now) =>
    accountWide(caller, command.seq, async (accountId) => {
      const found = await deps.accounts.accountById(accountId);
      if (!found) return;
      const closure = closeAccount(found.account, now);
      await deps.accounts.close(closure.vault, found.emailKeyedHash, closure.carryOver);
    });

  /** Keeps a failed store call from leaving a command half applied in memory. */
  const guarded = <T extends ClientMessage["type"]>(run: AccountHandler<T>): AccountHandler<T> =>
    async (caller, command, now) => {
      try {
        return await run(caller, command, now);
      } catch (cause) {
        deps.onStoreError(cause);
        return [out.warning(caller.key, "unavailable", command.seq)];
      }
    };

  return {
    requestCode: guarded(onRequestCode),
    verifyCode: guarded(onVerifyCode),
    signOutEverywhere: guarded(onSignOutEverywhere),
    deleteAccount: guarded(onDeleteAccount),
    unlink,
  };
};
