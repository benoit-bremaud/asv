import { useChat } from "../chat-context";
import { STRINGS } from "../strings";

/** Orange header with the red-ring logo (design pack); the logo is the screen's only `h1` (#64). */
export const Header = ({ connected }: { connected?: number }) => {
  const { state, commands } = useChat();
  return (
    <header className="header">
      <h1 className="logo">asv</h1>
      <span className="tagline">{STRINGS.tagline}</span>
      <span className="header-end">
        {state.me ? (
          <>
            <strong>{state.me.pseudo}</strong>
            <button type="button" className="bevel" onClick={(event) => {
              // Safari and Firefox on macOS do not focus a clicked button: focus it, so the dialog gives it back (#130).
              event.currentTarget.focus();
              commands.local({ type: "openAccount" });
            }}>{STRINGS.myAccount}</button>
            {state.moderator && (
              <button type="button" className="bevel" aria-haspopup="dialog" onClick={(event) => {
                event.currentTarget.focus();
                commands.openQueue();
              }}>{STRINGS.queue}</button>
            )}
            <button type="button" className="bevel" onClick={commands.leave}>{STRINGS.quit}</button>
          </>
        ) : (
          connected !== undefined && <span>{STRINGS.connected(connected)}</span>
        )}
      </span>
    </header>
  );
};
