import { useEffect, useId } from "react";
import { useChat } from "../chat-context";
import { isNoticeHeld } from "../store";
import { STRINGS } from "../strings";

/** How long a notice stays before it expires (#68, `web-ui/04` Notice lifetime). */
export const NOTICE_MS = 8_000;

/** The one notice timer, run by the always-mounted `Banners`; the hold lives in the store (#199). */
export const useNoticeTimer = () => {
  const { state, commands } = useChat();
  const { noticeSeq } = state;
  const running = state.notice !== undefined && !isNoticeHeld(state);
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => commands.local({ type: "expireNotice", seq: noticeSeq }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [running, noticeSeq, commands]);
};

/** The current notice with its dismiss button (`web-ui/05`); `show` filters it by code (account dialog, #136). */
export const Notice = ({ show = () => true }: { readonly show?: (code: string) => boolean }) => {
  const { notice, noticeSeq } = useChat().state;
  if (notice === undefined || !show(notice)) return null;
  return <NoticeCopy notice={notice} noticeSeq={noticeSeq} />;
};

/** One rendered copy of the notice; it holds the notice for every copy while the pointer or the focus is on it (#199). */
const NoticeCopy = ({ notice, noticeSeq }: { readonly notice: string; readonly noticeSeq: number }) => {
  const { commands } = useChat();
  const copy = useId();
  // A copy removed under the pointer or the focus gets no mouseleave or blur (dialog closed, filter changed).
  useEffect(
    () => () => {
      commands.local({ type: "releaseNotice", by: "pointer", copy });
      commands.local({ type: "releaseNotice", by: "focus", copy });
    },
    [commands, copy],
  );
  return (
    <p
      className="notice"
      role="alert"
      onMouseEnter={() => commands.local({ type: "holdNotice", by: "pointer", copy })}
      onMouseLeave={() => commands.local({ type: "releaseNotice", by: "pointer", copy })}
      onFocus={() => commands.local({ type: "holdNotice", by: "focus", copy })}
      onBlur={() => commands.local({ type: "releaseNotice", by: "focus", copy })}
    >
      {/* Only the text is keyed by the stamp: a repeated code is announced again and the focus stays on "fermer". */}
      <span key={noticeSeq}>{STRINGS.notices[notice] ?? STRINGS.genericNotice}</span>
      <button type="button" className="link" onClick={() => commands.local({ type: "dismissNotice" })}>
        {STRINGS.dismiss}
      </button>
    </p>
  );
};
