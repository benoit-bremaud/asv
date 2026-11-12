import { useChat } from "../chat-context";
import { STRINGS } from "../strings";

/** The current notice with its dismiss button (`web-ui/05`); `show` filters it by code (account dialog, #136). */
export const Notice = ({ show = () => true }: { readonly show?: (code: string) => boolean }) => {
  const { state, commands } = useChat();
  if (!state.notice || !show(state.notice)) return null;
  return (
    <p className="notice" role="alert">
      {STRINGS.notices[state.notice] ?? STRINGS.genericNotice}
      <button type="button" className="link" onClick={() => commands.local({ type: "dismissNotice" })}>{STRINGS.dismiss}</button>
    </p>
  );
};
