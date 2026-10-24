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
  type HubState,
  type SessionFilter,
} from "../domain";
import type { ClientMessage } from "../shared/protocol";
import type { HubDeps } from "./hub";
import { sessionOf, type Outgoing, type OutgoingModule } from "./outgoing";

type Command<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;
export type AccountCommand = Command<"requestCode" | "verifyCode" | "signOutEverywhere" | "deleteAccount">;

/** The socket asking, as the account handlers see it. */
export interface Caller {
  readonly key: string;
  readonly ip: string;
  readonly sessionId: string;
}

/** What the account handlers share with the hub. */
export interface HubContext {
  readonly deps: HubDeps;
  readonly out: OutgoingModule;
  state(): HubState;
  setState(next: HubState): void;
}

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
  const onRequestCode = async (caller: Caller, command: Command<"requestCode">, now: Date): Promise<Outgoing[]> => {
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
  const onVerifyCode = async (caller: Caller, command: Command<"verifyCode">, now: Date): Promise<Outgoing[]> => {
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

  /** UC18 "everywhere" and UC19, over the WebSocket. */
  const onAccountWide = async (caller: Caller, command: Command<"signOutEverywhere" | "deleteAccount">, now: Date): Promise<Outgoing[]> => {
    const accountId = sessionOf(ctx.state(), caller.sessionId).accountId;
    if (!accountId) return [out.warning(caller.key, "notSignedIn", command.seq)];
    if (command.type === "deleteAccount") {
      const found = await deps.accounts.accountById(accountId);
      if (found) {
        const closure = closeAccount(found.account, now);
        await deps.accounts.close(closure.vault, found.emailKeyedHash, closure.carryOver);
      }
    } else {
      await deps.accounts.deleteAllDevices(accountId);
    }
    return unlink({ by: "account", accountId });
  };

  /** Every account command goes through this guard. */
  const guarded = async (caller: Caller, command: AccountCommand, run: () => Promise<Outgoing[]>): Promise<Outgoing[]> => {
    try {
      return await run();
    } catch (cause) {
      deps.onStoreError(cause);
      return [out.warning(caller.key, "unavailable", command.seq)];
    }
  };

  const handle = (caller: Caller, command: AccountCommand, now: Date): Promise<Outgoing[]> =>
    guarded(caller, command, () => {
      switch (command.type) {
        case "requestCode":
          return onRequestCode(caller, command, now);
        case "verifyCode":
          return onVerifyCode(caller, command, now);
        default:
          return onAccountWide(caller, command, now);
      }
    });

  return { handle, unlink };
};
