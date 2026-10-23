import { useChat } from "../chat-context";
import { STRINGS } from "../strings";

/** Orange header with the red-ring logo (design pack). */
export const Header = ({ connected }: { connected?: number }) => {
  const { state, commands } = useChat();
  return (
    <header className="header">
      <span className="logo" aria-label="asv">asv</span>
      <span className="tagline">{STRINGS.tagline}</span>
      <span className="header-end">
        {state.me ? (
          <>
            <strong>{state.me.pseudo}</strong>
            <button type="button" className="bevel" onClick={() => commands.local({ type: "openAccount" })}>{STRINGS.myAccount}</button>
            <button type="button" className="bevel" onClick={commands.leave}>{STRINGS.quit}</button>
          </>
        ) : (
          connected !== undefined && <span>{STRINGS.connected(connected)}</span>
        )}
      </span>
    </header>
  );
};
