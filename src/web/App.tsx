import { ChatProvider, browserConnection, useChat, type ConnectionFactory } from "./chat-context";
import { AccountPanel } from "./screens/AccountPanel";
import { EntryScreen } from "./screens/EntryScreen";
import { QueueDialog, ReportDialog } from "./screens/ModerationDialogs";
import { Notice, useNoticeTimer } from "./screens/Notice";
import { PrivateWindows } from "./screens/PrivateWindows";
import { RoomScreen } from "./screens/RoomScreen";
import { RoomsScreen } from "./screens/RoomsScreen";
import { isAccountNotice } from "./store";
import { STRINGS } from "./strings";

/** Reconnecting banner and notices, over every screen (`web-ui/05`). */
const Banners = () => {
  const { state } = useChat();
  useNoticeTimer();
  return (
    <>
      {state.link === "reconnecting" && <output className="banner">{STRINGS.reconnecting}</output>}
      {state.link === "offline" && state.screen === "entry" && <output className="banner">{STRINGS.offline}</output>}
      {/* The modal account dialog shows the account notices itself (#63, #136), the search, report and queue dialogs every notice (#185). */}
      <Notice show={(code) => !state.searchOpen && !state.report && !state.queue && !(state.account.open && state.screen !== "entry" && isAccountNotice(code))} />
    </>
  );
};

const InChatOverlays = () =>
  useChat().state.screen === "entry" ? null : (
    <>
      <PrivateWindows />
      <AccountPanel />
      <ReportDialog />
      <QueueDialog />
    </>
  );

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
      {/* In the chat only (`web-ui/05`). */}
      <InChatOverlays />
    </div>
  </ChatProvider>
);
