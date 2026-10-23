/**
 * Connection manager (`web-ui/04`): the only module that talks to the WebSocket. Heartbeat (BR-010),
 * reconnection with backoff (ASV-NF-011) and resume (UC13, BR-014). Outside React: it dispatches actions.
 */
import { serverMessage, type ClientMessage } from "../shared/protocol";
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
}

/** The live connection the provider holds. */
export interface Connection {
  enter(form: EnterForm): void;
  send(command: Command): void;
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

const isSaved = (value: unknown): value is Saved =>
  typeof value === "object" && value !== null && "resumeToken" in value && "profile" in value &&
  typeof value.resumeToken === "string";

/** Opens the socket and keeps it alive until `close()`. */
export const createConnection = (deps: ConnectionDeps): Connection => {
  let socket: SocketLike | undefined;
  let seq = 0;
  let attempt = 0;
  let stopped = false;
  let pendingProfile: Profile | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const load = (): Saved | undefined => {
    try {
      const parsed: unknown = JSON.parse(deps.storage.getItem(KEY) ?? "null");
      return isSaved(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
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

  const stopTimers = () => {
    clearInterval(heartbeat);
    clearTimeout(pongTimer);
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
    const message = parsed.data;
    if (message.type === "entered" && pendingProfile) {
      save({ resumeToken: message.payload.resumeToken, profile: pendingProfile });
      pendingProfile = undefined;
    } else if (message.type === "entryRefused") {
      pendingProfile = undefined;
    } else if (message.type === "resumed") {
      const saved = load();
      if (saved) save({ ...saved, resumeToken: message.payload.resumeToken });
      deps.dispatch({ type: "link", link: "online" });
    } else if (message.type === "resumeRefused" || message.type === "expelled") {
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
    enter(form) {
      pendingProfile = { gender: form.gender, age: form.age, city: form.city };
      deps.dispatch({ type: "entering", pseudo: form.pseudo.normalize("NFC") });
      write({ type: "enter", payload: form });
    },
    send(command) {
      write(command);
    },
    leave() {
      write({ type: "leave", payload: {} });
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
