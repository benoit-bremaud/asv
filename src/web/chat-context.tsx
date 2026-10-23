import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { createConnection, type Connection, type ConnectionDeps, type EnterForm } from "./connection";
import { chatReducer, initialState, type Action, type ChatState } from "./store";

/** The only local actions screens may dispatch; server actions come from the connection manager. */
export type LocalAction = Extract<Action, { type: "showRooms" | "showRoom" | "dismissNotice" }>;

/** What screens may do; only the connection manager touches the socket (`web-ui/03`). */
export interface Commands {
  enter(form: EnterForm): void;
  joinRoom(roomId: string): void;
  leaveRoom(roomId: string): void;
  createRoom(name: string): void;
  /** False when nothing was sent (offline), so the screen keeps the draft. */
  post(roomId: string, text: string): boolean;
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
    const send: Connection["send"] = (command) => connection.current?.send(command) ?? false;
    return {
      enter: (form) => connection.current?.enter(form),
      joinRoom: (roomId) => send({ type: "joinRoom", payload: { roomId } }),
      leaveRoom: (roomId) => {
        send({ type: "leaveRoom", payload: { roomId } });
        dispatch({ type: "closeRoom", roomId });
      },
      createRoom: (name) => send({ type: "createRoom", payload: { name } }),
      post: (roomId, text) => send({ type: "postRoom", payload: { roomId, text } }),
      leave: () => connection.current?.leave(),
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
