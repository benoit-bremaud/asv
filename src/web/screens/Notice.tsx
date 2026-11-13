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
  // WCAG 2.2.1 and 2.4.3: no expiry while the pointer or the focus is on the notice. The hold names its stamp, so a
  // notice removed under the pointer (no `mouseleave`) never holds the next one.
  const [heldSeq, setHeldSeq] = useState<number>();
  // The focus holds every notice shown while it stays on the (stable) notice, a new one included.
  const [focused, setFocused] = useState(false);
  // A notice removed under the focus sends no blur: reset during render (React's "adjust state on prop change").
  if (!shown && focused) setFocused(false);
  const held = focused || heldSeq === noticeSeq;
  useEffect(() => {
    if (!shown || held) return;
    const timer = setTimeout(() => commands.local({ type: "expireNotice", seq: noticeSeq }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown, held, noticeSeq, commands]);
  if (!shown) return null;
  return (
    <p className="notice" role="alert" onMouseEnter={() => setHeldSeq(noticeSeq)} onMouseLeave={() => setHeldSeq(undefined)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      {/* Only the text is keyed by the stamp: a repeated code is announced again and the focus stays on "fermer". */}
      <span key={noticeSeq}>{STRINGS.notices[notice] ?? STRINGS.genericNotice}</span>
      <button type="button" className="link" onClick={() => commands.local({ type: "dismissNotice" })}>{STRINGS.dismiss}</button>
    </p>
  );
};
