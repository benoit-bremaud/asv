/**
 * Connection manager (`web-ui/04`): the only module that talks to the WebSocket. Heartbeat (BR-010),
 * reconnection with backoff (ASV-NF-011) and resume (UC13, BR-014). Outside React: it dispatches actions.
 */
import { resumePayload, serverMessage, type ClientMessage, type ServerMessage } from "../shared/protocol";
import type { Action } from "./store";

/** The subset of the browser WebSocket the manager uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

/** What `sessionStorage` holds (ADR-0011): the resume token and the profile, nothing else. */
interface Saved {
  readonly resumeToken: string;
  readonly profile: Profile;
}

type Profile = Extract<ClientMessage, { type: "resume" }>["payload"]["profile"];
/** The entry form as screens send it; the moderator grant is never sent from the web client. */
export type EnterForm = Omit<Extract<ClientMessage, { type: "enter" }>["payload"], "moderatorGrant">;
type Outbound<M = ClientMessage> = M extends { type: infer T; payload: infer P } ? { type: T; payload: P } : never;
/** What screens may send, without `seq` (the manager numbers it); enter, resume and leave have their own methods. */
export type Command = Exclude<Outbound, { type: "enter" | "resume" | "leave" }>;

/** What the manager needs from the browser, injected so tests use fakes. */
export interface ConnectionDeps {
  readonly url: string;
  readonly createSocket: (url: string) => SocketLike;
  readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readonly dispatch: (action: Action) => void;
  /** Same-origin account routes (`platform/04d`); the browser's `fetch` by default. */
  readonly fetch?: typeof fetch;
}

/** The "Membres" panel of the entry screen: a code requested as soon as `entered` arrives (`web-ui/06`). */
export interface CodeRequest {
  readonly email: string;
  readonly remember: boolean;
}

/** The live connection the provider holds. */
export interface Connection {
  enter(form: EnterForm, codeRequest?: CodeRequest): void;
  /** UC18 "this device": forgets the device cookie, then shows the panel signed out. */
  signOutDevice(): Promise<void>;
  /** False when the socket is not open: nothing was sent. */
  send(command: Command): boolean;
  leave(): void;
  close(): void;
}

/** Interval between `ping` frames (ADR-0011). */
export const HEARTBEAT_MS = 25_000;
/** How long the manager waits for `pong` before it treats the socket as lost. */
export const PONG_TIMEOUT_MS = 10_000;
/** Reconnection delays, the last one repeats (`web-ui/04`). */
export const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
const KEY = "asv.session";
const OPEN = 1;


/** Opens the socket and keeps it alive until `close()`. */
export const createConnection = (deps: ConnectionDeps): Connection => {
  let socket: SocketLike | undefined;
  let seq = 0;
  let attempt = 0;
  let stopped = false;
  let pendingProfile: Profile | undefined;
  let pendingCode: CodeRequest | undefined;
  const post = async (path: string, body?: object): Promise<boolean> => {
    try {
      const response = await (deps.fetch ?? fetch)(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
  /** BR-073: the claim becomes the HttpOnly cookie; a failure keeps this visit signed in only. */
  const redeem = async (claim: string) => {
    const ok = await post("/account/device", { claim });
    if (!ok) deps.dispatch({ type: "notice", code: "deviceNotSaved" });
    deps.dispatch({ type: "accountStep", step: "signedIn" });
  };
  /** `seq` of the resume awaiting an answer, so an `error` replying to it is not left hanging. */
  let resumeSeq: number | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const load = (): Saved | undefined => {
    try {
      const raw = deps.storage.getItem(KEY);
      if (raw === null) return undefined;
      const saved = resumePayload.safeParse(JSON.parse(raw));
      if (saved.success) return saved.data;
    } catch {
      // Unreadable JSON: dropped below like any invalid record.
    }
    forget();
    return undefined;
  };
  const save = (saved: Saved) => deps.storage.setItem(KEY, JSON.stringify(saved));
  const forget = () => deps.storage.removeItem(KEY);

  const write = (message: Outbound): boolean => {
    if (socket?.readyState !== OPEN) {
      deps.dispatch({ type: "notice", code: "notConnected" });
      return false;
    }
    socket.send(JSON.stringify({ ...message, seq: seq++ }));
    return true;
  };

  const requestCode = (code: CodeRequest): boolean => {
    const sent = write({ type: "requestCode", payload: code });
    if (sent) deps.dispatch({ type: "requestingCode" });
    return sent;
  };

  const stopTimers = () => {
    clearInterval(heartbeat);
    clearTimeout(pongTimer);
  };

  const onEntered = (message: Extract<ServerMessage, { type: "entered" }>) => {
    if (pendingProfile) save({ resumeToken: message.payload.resumeToken, profile: pendingProfile });
    pendingProfile = undefined;
    // An unknown or expired cookie: drop it silently (`web-ui/06`).
    if (message.payload.staleDevice) void post("/account/sign-out");
    const code = pendingCode;
    pendingCode = undefined;
    deps.dispatch({ type: "server", message });
    if (code) requestCode(code);
  };

  const onResumeError = (code: string) => {
    resumeSeq = undefined;
    if (code === "logUnavailable") {
      // Transient: the close path reconnects with backoff and resumes again.
      socket?.close();
    } else {
      // The saved session cannot resume (e.g. a profile the domain refuses): back to entry.
      forget();
      deps.dispatch({ type: "link", link: "online" });
    }
  };

  const onMessage = (data: unknown) => {
    if (data === "pong") {
      clearTimeout(pongTimer);
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return;
    }
    const parsed = serverMessage.safeParse(json);
    if (!parsed.success) return;
    handle(parsed.data);
  };

  /** Bookkeeping per message type, then the reducer sees every message once. */
  const handle = (message: ServerMessage) => {
    if (message.type === "entered") {
      onEntered(message);
      return;
    } else if (message.type === "accountLinked" && message.payload.deviceClaim) {
      deps.dispatch({ type: "server", message });
      void redeem(message.payload.deviceClaim);
      return;
    } else if (message.type === "entryRefused") {
      pendingProfile = undefined;
      pendingCode = undefined;
    } else if (message.type === "error" && resumeSeq !== undefined && message.payload.replyTo === resumeSeq) {
      onResumeError(message.payload.code);
    } else if (message.type === "resumed") {
      resumeSeq = undefined;
      const saved = load();
      if (saved) save({ ...saved, resumeToken: message.payload.resumeToken });
      deps.dispatch({ type: "link", link: "online" });
    } else if (message.type === "resumeRefused" || message.type === "expelled") {
      resumeSeq = undefined;
      forget();
      deps.dispatch({ type: "link", link: "online" });
    }
    deps.dispatch({ type: "server", message });
  };

  const connect = () => {
    const current = deps.createSocket(deps.url);
    socket = current;
    current.onopen = () => {
      attempt = 0;
      heartbeat = setInterval(() => {
        current.send("ping");
        clearTimeout(pongTimer);
        // No pong in time: treat the socket as lost (ADR-0011).
        pongTimer = setTimeout(() => current.close(), PONG_TIMEOUT_MS);
      }, HEARTBEAT_MS);
      const saved = load();
      if (saved) {
        resumeSeq = seq;
        write({ type: "resume", payload: saved });
      } else {
        deps.dispatch({ type: "link", link: "online" });
      }
    };
    current.onmessage = (event) => onMessage(event.data);
    current.onclose = () => {
      stopTimers();
      if (stopped || socket !== current) return;
      deps.dispatch({ type: "link", link: load() ? "reconnecting" : "offline" });
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    enter(form, codeRequest) {
      // Pending only once the frame left: a failed write gets no answer to clear it.
      if (!write({ type: "enter", payload: form })) return;
      pendingProfile = { gender: form.gender, age: form.age, city: form.city };
      pendingCode = codeRequest;
      deps.dispatch({ type: "entering", pseudo: form.pseudo.normalize("NFC") });
    },
    send(command) {
      return command.type === "requestCode" ? requestCode(command.payload) : write(command);
    },
    async signOutDevice() {
      await post("/account/sign-out");
      deps.dispatch({ type: "accountStep", step: "signedOut" });
    },
    leave() {
      // Offline: the server still holds the session, so keep the token to resume it (`write` shows the notice).
      // A pending resume: the socket is not bound yet, so the server would refuse the leave.
      if (resumeSeq !== undefined) {
        deps.dispatch({ type: "notice", code: "notConnected" });
        return;
      }
      if (!write({ type: "leave", payload: {} })) return;
      forget();
      deps.dispatch({ type: "left" });
    },
    close() {
      stopped = true;
      stopTimers();
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
};
