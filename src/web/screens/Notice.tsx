import { useChat } from "../chat-context";
import { STRINGS } from "../strings";

/** The current notice with its dismiss button (`web-ui/05`); shown in the account dialog while it is open (#63). */
export const Notice = () => {
  const { state, commands } = useChat();
  if (!state.notice) return null;
  return (
    <p className="notice" role="alert">
      {STRINGS.notices[state.notice] ?? STRINGS.genericNotice}
      <button type="button" className="link" onClick={() => commands.local({ type: "dismissNotice" })}>{STRINGS.dismiss}</button>
    </p>
  );
};
