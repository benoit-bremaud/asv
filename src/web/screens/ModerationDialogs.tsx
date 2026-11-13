import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SubmitEvent, type SyntheticEvent } from "react";
import { expelDuration, reportReason } from "../../shared/protocol";
import { useChat } from "../chat-context";
import type { QueuedReport } from "../store";
import { STRINGS } from "../strings";
import { Notice } from "./Notice";

const REASONS = reportReason.options;
const DURATIONS = expelDuration.options;

/** A modal dialog of the chat, as the search dialog (`web-ui/07`): Escape and a close request call `onClose`, the focus goes back. */
const Modal = ({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  const cancel = (event: SyntheticEvent) => {
    event.preventDefault();
    onClose();
  };
  return (
    <dialog ref={dialog} className="panel overlay" aria-labelledby={labelledBy} onCancel={cancel}>
      {children}
      {/* The page behind is inert: the dialog shows the notices raised meanwhile (#185). */}
      <Notice />
      <button type="button" className="link" onClick={onClose}>{STRINGS.close}</button>
    </dialog>
  );
};

/** UC9: pick a reason and send the report; it closes on `reportSent` (`web-ui/08`). */
export const ReportDialog = () => {
  const { state, commands } = useChat();
  const [reason, setReason] = useState<(typeof REASONS)[number]>();
  const draft = state.report;
  if (!draft) return null;
  const close = () => commands.local({ type: "closeReport" });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (reason) commands.report(draft, reason);
  };
  return (
    <Modal labelledBy="report-title" onClose={close}>
      <form onSubmit={submit}>
        <h2 id="report-title">{STRINGS.reportTitle(draft.targetPseudo)}</h2>
        {draft.excerpt && <blockquote className="small" aria-label={STRINGS.reportExcerpt}>{draft.excerpt}</blockquote>}
        <fieldset>
          <legend>{STRINGS.reportReason}</legend>
          {REASONS.map((value) => (
            <label key={value} className="inline">
              <input type="radio" name="reason" checked={reason === value} onChange={() => setReason(value)} />
              {STRINGS.reasons[value]}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="bevel primary" disabled={!reason}>{STRINGS.send}</button>
      </form>
    </Modal>
  );
};

/** Context lines keyed by report and position: the list never reorders. */
const contextLines = (report: { readonly id: string; readonly context: readonly string[] }) =>
  report.context.map((line, position) => ({ key: `${report.id}-${position}`, line }));

const QueueRow = ({ report }: { report: QueuedReport }) => {
  const { commands } = useChat();
  const date = new Date(report.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const close = (outcome: "noAction" | "warned") => commands.moderate({ type: "closeReport", payload: { reportId: report.id, outcome } });
  return (
    <li>
      <p>
        <strong>{report.targetPseudo ?? report.targetRoomId}</strong> — {STRINGS.reasons[report.reason]}{" "}
        <span className="small">{STRINGS.queueBy(report.authorPseudo, date)}</span>
      </p>
      <p className="small">
        <span className={`urgency urgency-${report.triage?.urgency ?? "unknown"}`}>{STRINGS.urgency(STRINGS.urgencies[report.triage?.urgency ?? "unknown"])}</span>{" "}
        {STRINGS.queueTarget(report.hasAccount, report.connected, report.activeStrikes)}
      </p>
      {report.triage && (
        <section className="small triage" aria-label={STRINGS.triageNote}>
          <p><em>{STRINGS.triageNote}</em> : {STRINGS.categories[report.triage.category]} — {report.triage.summary}</p>
          {report.triage.labels.length > 0 && <p>{STRINGS.legend(report.triage.labels)}</p>}
        </section>
      )}
      {report.excerpt && <blockquote className="small">{report.excerpt}</blockquote>}
      {report.context.length > 0 && (
        <details>
          <summary>{STRINGS.queueContext}</summary>
          <ol className="small">{contextLines(report).map(({ key, line }) => <li key={key}>{line}</li>)}</ol>
        </details>
      )}
      <p className="queue-actions">
        <button type="button" className="bevel" onClick={() => close("noAction")}>{STRINGS.noAction}</button>
        {/* BR-074: a strike needs an account, one per report; a struck report only asks the suspension again. */}
        <button type="button" className="bevel" onClick={() => close("warned")}>{report.struck ? STRINGS.askSuspension : STRINGS.warn}</button>
        {DURATIONS.map((duration) => (
          <button key={duration} type="button" className="bevel" onClick={() => commands.moderate({ type: "expel", payload: { reportId: report.id, duration } })}>
            {STRINGS.expel(STRINGS.durations[duration])}
          </button>
        ))}
      </p>
    </li>
  );
};

/** UC12: the first 50 open reports in BR-102 order, and the suspension proposal (BR-075); moderators only. */
export const QueueDialog = () => {
  const { state, commands } = useChat();
  const { queue } = state;
  // Closing a report frees a row: the next one is asked once the page is short (BR-102).
  const short = queue !== undefined && !queue.loading && queue.reports.length < queue.total;
  const shown = queue?.reports.length ?? 0;
  useEffect(() => {
    if (short) commands.refreshQueue();
  }, [short, shown, commands]);
  if (!queue) return null;
  const { proposal } = queue;
  return (
    <Modal labelledBy="queue-title" onClose={() => commands.local({ type: "closeQueue" })}>
      <h2 id="queue-title">{state.moderatorName ? STRINGS.queueTitleOf(state.moderatorName) : STRINGS.queueTitle}</h2>
      {proposal && (
        <section role="alert" className="queue-proposal">
          <p>{STRINGS.proposal(proposal.activeStrikes)}</p>
          <button type="button" className="bevel primary" onClick={() => commands.moderate({ type: "confirmSuspension", payload: { accountId: proposal.accountId, reportId: proposal.reportId } })}>{STRINGS.suspend}</button>
          <button type="button" className="bevel" onClick={() => commands.moderate({ type: "declineSuspension", payload: { accountId: proposal.accountId, reportId: proposal.reportId } })}>{STRINGS.noSuspend}</button>
        </section>
      )}
      {queue.loading && <p className="small">{STRINGS.queueLoading}</p>}
      {!queue.loading && queue.reports.length === 0 && <p className="small">{STRINGS.queueEmpty}</p>}
      {queue.total > queue.reports.length && <p className="small">{STRINGS.queueCount(queue.reports.length, queue.total)}</p>}
      <ul className="queue">{queue.reports.map((report) => <QueueRow key={report.id} report={report} />)}</ul>
    </Modal>
  );
};
