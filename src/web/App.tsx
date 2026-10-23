import { ChatProvider, browserConnection, useChat, type ConnectionFactory } from "./chat-context";
import { EntryScreen } from "./screens/EntryScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { RoomsScreen } from "./screens/RoomsScreen";
import { STRINGS } from "./strings";

/** Reconnecting banner and notices, over every screen (`web-ui/05`). */
const Banners = () => {
  const { state, commands } = useChat();
  return (
    <>
      {state.link === "reconnecting" && <p className="banner" role="status">{STRINGS.reconnecting}</p>}
      {state.link === "offline" && state.screen === "entry" && <p className="banner" role="status">{STRINGS.offline}</p>}
      {state.notice && (
        <p className="notice" role="alert">
          {STRINGS.notices[state.notice] ?? STRINGS.genericNotice}
          <button type="button" className="link" onClick={() => commands.local({ type: "dismissNotice" })}>{STRINGS.dismiss}</button>
        </p>
      )}
    </>
  );
};

const Screens = () => {
  const { state } = useChat();
  if (state.screen === "room") return <RoomScreen />;
  if (state.screen === "rooms") return <RoomsScreen />;
  return <EntryScreen />;
};

/** Web client (`web-ui` study): one provider, one screen at a time. */
export const App = ({ connect = browserConnection }: { connect?: ConnectionFactory }) => (
  <ChatProvider connect={connect}>
    <div className="app">
      <Banners />
      <Screens />
    </div>
  </ChatProvider>
);
