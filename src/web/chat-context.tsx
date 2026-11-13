import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { createConnection, type CodeRequest, type Connection, type ConnectionDeps, type EnterForm } from "./connection";
import { chatReducer, initialState, type Action, type ChatState } from "./store";

/** The only local actions screens may dispatch; server actions come from the connection manager. */
export type LocalAction = Extract<Action, { type: "showRooms" | "showRoom" | "dismissNotice" | "expireNotice" | "openAccount" | "closeAccount" | "accountStep" | "openPrivate" | "togglePrivate" | "clearSearch" }>;

/** What screens may do; only the connection manager touches the socket (`web-ui/03`). */
export interface Commands {
  /** With a code request, the "Membres" panel asks for a code once entered (`web-ui/06`). */
  enter(form: EnterForm, codeRequest?: CodeRequest): void;
  requestCode(request: CodeRequest): void;
  verifyCode(code: string): void;
  /** "nouveau code": back to the e-mail step, the saved code deadline dropped (BR-087). */
  newCode(): void;
  signOutDevice(): void;
  signOutEverywhere(): void;
  deleteAccount(): void;
  joinRoom(roomId: string): void;
  leaveRoom(roomId: string): void;
  /** The `seq` sent, or `undefined` offline, so the screen keeps the name; a refusal names it in `refusedSeq`. */
  createRoom(name: string): number | undefined;
  /** False when nothing was sent (offline), so the screen keeps the draft. */
  post(roomId: string, text: string): boolean;
  /** The `seq` sent, or `undefined` offline, so the window keeps the draft; a refusal names it in `refusedSeq`. */
  sendPrivate(targetPseudo: string, text: string): number | undefined;
  /** `notify`: the window has a conversation on the server (not pending, partner not gone). */
  /** Closes the window locally; false when the server could not be told, and the window stays. */
  closePrivate(windowKey: string, notify: boolean): boolean;
  ignore(sessionId: string): void;
  unignore(sessionId: string): void;
  search(query: string): void;
  leave(): void;
  local(action: LocalAction): void;
}

interface Chat {
  readonly state: ChatState;
  readonly commands: Commands;
}

const ChatContext = createContext<Chat | undefined>(undefined);

/** Builds the connection from the reducer's dispatch; injected so tests run without a server. */
export type ConnectionFactory = (dispatch: ConnectionDeps["dispatch"]) => Connection;

/** Same origin `/ws`, `wss:` under HTTPS (`web-ui/04`). */
export const browserConnection: ConnectionFactory = (dispatch) =>
  createConnection({
    url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    createSocket: (url) => new WebSocket(url),
    storage: sessionStorage,
    dispatch,
  });

/** Owns the connection: opens it on mount, closes it on unmount, and gives screens the state and commands. */
export const ChatProvider = ({ connect, children }: { connect: ConnectionFactory; children: ReactNode }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const connection = useRef<Connection | undefined>(undefined);

  useEffect(() => {
    const current = connect(dispatch);
    connection.current = current;
    return () => current.close();
  }, [connect]);

  const commands = useMemo<Commands>(() => {
    const send: Connection["send"] = (command) => connection.current?.send(command);
    const sent = (command: Parameters<Connection["send"]>[0]): boolean => send(command) !== undefined;
    return {
      enter: (form, codeRequest) => connection.current?.enter(form, codeRequest),
      requestCode: (request) => send({ type: "requestCode", payload: request }),
      verifyCode: (code) => {
        if (sent({ type: "verifyCode", payload: { code } })) dispatch({ type: "verifyingCode" });
      },
      signOutDevice: () => void connection.current?.signOutDevice(),
      signOutEverywhere: () => send({ type: "signOutEverywhere", payload: {} }),
      deleteAccount: () => send({ type: "deleteAccount", payload: {} }),
      joinRoom: (roomId) => send({ type: "joinRoom", payload: { roomId } }),
      leaveRoom: (roomId) => {
        // Offline: the server keeps the membership, so the tab stays.
        if (sent({ type: "leaveRoom", payload: { roomId } })) dispatch({ type: "closeRoom", roomId });
      },
      createRoom: (name) => send({ type: "createRoom", payload: { name } }),
      post: (roomId, text) => sent({ type: "postRoom", payload: { roomId, text } }),
      sendPrivate: (targetPseudo, text) => send({ type: "sendPrivate", payload: { targetPseudo, text } }),
      closePrivate: (windowKey, notify) => {
        // Offline: the server keeps the window open (BR-043 slot), so it stays here too, like `leaveRoom`.
        if (notify && !sent({ type: "closePrivate", payload: { conversationId: windowKey } })) return false;
        dispatch({ type: "closePrivate", conversationId: windowKey });
        return true;
      },
      ignore: (sessionId) => send({ type: "ignore", payload: { targetSessionId: sessionId } }),
      unignore: (sessionId) => send({ type: "unignore", payload: { targetSessionId: sessionId } }),
      search: (query) => {
        if (sent({ type: "search", payload: { query } })) dispatch({ type: "searching", query });
      },
      leave: () => connection.current?.leave(),
      newCode: () => {
        connection.current?.forgetCode();
        dispatch({ type: "accountStep", step: "askEmail" });
      },
      local: dispatch,
    };
  }, []);

  const value = useMemo(() => ({ state, commands }), [state, commands]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

/** State and commands of the chat. @throws outside a `ChatProvider`. */
export const useChat = (): Chat => {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("useChat outside ChatProvider");
  return chat;
};
