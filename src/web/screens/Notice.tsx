import { useEffect, useState } from "react";
import { useChat } from "../chat-context";
import { STRINGS } from "../strings";

/** How long a notice stays before it expires (#68, `web-ui/04` Notice lifetime). */
export const NOTICE_MS = 8_000;

/** The current notice with its dismiss button (`web-ui/05`); `show` filters it by code (account dialog, #136). */
export const Notice = ({ show = () => true }: { readonly show?: (code: string) => boolean }) => {
  const { state, commands } = useChat();
  const { notice, noticeSeq } = state;
  const shown = notice !== undefined && show(notice);
  // WCAG 2.2.1 and 2.4.3: no expiry while the pointer or the focus is on the notice.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!shown || held) return;
    const timer = setTimeout(() => commands.local({ type: "expireNotice", seq: noticeSeq }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown, held, noticeSeq, commands]);
  if (!shown) return null;
  return (
    // Keyed by the stamp, so a repeated code is announced again.
    <p key={noticeSeq} className="notice" role="alert" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      {STRINGS.notices[notice] ?? STRINGS.genericNotice}
      <button type="button" className="link" onClick={() => commands.local({ type: "dismissNotice" })}>{STRINGS.dismiss}</button>
    </p>
  );
};
