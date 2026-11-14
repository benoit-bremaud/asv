import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SubmitEvent, type SyntheticEvent } from "react";
import { CAPS, expelDuration, offenceCategory, reportReason } from "../../shared/protocol";
import { useChat } from "../chat-context";
import type { AlertedReport, QueuedReport, QueueView } from "../store";
import { STRINGS } from "../strings";
import { Notice } from "./Notice";

const REASONS = reportReason.options;
const DURATIONS = expelDuration.options;
const OFFENCES = offenceCategory.options;

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
        <h2 id="report-title">{draft.targetKind === "room" ? STRINGS.reportRoomTitle(draft.targetPseudo) : STRINGS.reportTitle(draft.targetPseudo)}</h2>
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

const shortDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

type Offence = (typeof OFFENCES)[number];
/** `""`: nothing picked yet, only on "expulsion grave" (`web-ui/08`). */
type AlertChoice = Offence | "none" | "";
type Alert = AlertedReport["alert"];

/** BR-104: the category sent with a closing action; the AI category never fills it (ADR-0010). */
const alertOf = (choice: AlertChoice): Offence | undefined => (choice === "" || choice === "none" ? undefined : choice);

/** "à signaler aux autorités": "aucune" and the categories of `security-and-rgpd.md` §6. */
const AlertSelect = ({ id, value, onChange, required = false }: { id: string; value: AlertChoice; onChange: (choice: AlertChoice) => void; required?: boolean }) => (
  <label className="inline small" htmlFor={id}>
    {STRINGS.alertSelect}{" "}
    <select id={id} value={value} onChange={(event) => onChange(event.target.value as AlertChoice)}>
      {required && <option value="" disabled>{STRINGS.alertPick}</option>}
      <option value="none">{STRINGS.alertNone}</option>
      {OFFENCES.map((offence) => <option key={offence} value={offence}>{STRINGS.offences[offence]}</option>)}
    </select>
  </label>
);

const alertStatus = (alert: Alert) => {
  if (alert.status === "pending") return STRINGS.alertPending;
  const channel = alert.channel ? STRINGS.channels[alert.channel] : "";
  return STRINGS.alertFiled(channel, alert.reference ?? "");
};

/** The reported content, as text only, in both tabs. */
const ReportBody = ({ report }: { report: QueuedReport | AlertedReport }) => (
  <>
    <p>
      <strong>{report.targetPseudo ?? report.targetRoomId}</strong> — {STRINGS.reasons[report.reason]}{" "}
      <span className="small">{STRINGS.queueBy(report.authorPseudo, shortDate(report.createdAt))}</span>
    </p>
    {report.excerpt && <blockquote className="small">{report.excerpt}</blockquote>}
    {report.context.length > 0 && (
      <details>
        <summary>{STRINGS.queueContext}</summary>
        <ol className="small">{contextLines(report).map(({ key, line }) => <li key={key}>{line}</li>)}</ol>
      </details>
    )}
  </>
);

/** BR-103: the confirmation names the effects; "confirmer" waits for an alert choice. */
const SevereConfirm = ({ report, onCancel }: { report: QueuedReport; onCancel: () => void }) => {
  const { commands } = useChat();
  const [choice, setChoice] = useState<AlertChoice>("");
  return (
    <section role="alert" className="queue-proposal">
      <p>{STRINGS.severeEffects(report.hasAccount)}</p>
      <AlertSelect id={`severe-alert-${report.id}`} value={choice} onChange={setChoice} required />
      <button type="button" className="bevel primary" disabled={choice === ""} onClick={() => commands.moderate({ type: "expel", payload: { reportId: report.id, duration: "7d", severe: true, alertAuthorities: alertOf(choice) } })}>
        {STRINGS.confirmSevere}
      </button>
      <button type="button" className="bevel" onClick={onCancel}>{STRINGS.cancel}</button>
    </section>
  );
};

const QueueRow = ({ report }: { report: QueuedReport }) => {
  const { commands } = useChat();
  const [choice, setChoice] = useState<AlertChoice>("none");
  const [severe, setSevere] = useState(false);
  const alertAuthorities = alertOf(choice);
  const close = (outcome: "noAction" | "warned") => commands.moderate({ type: "closeReport", payload: { reportId: report.id, outcome, alertAuthorities } });
  const room = report.targetKind === "room";
  return (
    <li>
      <ReportBody report={report} />
      <p className="small">
        <span className={`urgency urgency-${report.triage?.urgency ?? "unknown"}`}>{STRINGS.urgency(STRINGS.urgencies[report.triage?.urgency ?? "unknown"])}</span>{" "}
        {!room && STRINGS.queueTarget(report.hasAccount, report.connected, report.activeStrikes)}
      </p>
      {report.alert && <p className="small">{STRINGS.alertStatus(alertStatus(report.alert))}</p>}
      {report.triage && (
        <section className="small triage" aria-label={STRINGS.triageNote}>
          <p><em>{STRINGS.triageNote}</em> : {STRINGS.categories[report.triage.category]} — {report.triage.summary}</p>
          {report.triage.labels.length > 0 && <p>{STRINGS.legend(report.triage.labels)}</p>}
        </section>
      )}
      {severe ? (
        <SevereConfirm report={report} onCancel={() => setSevere(false)} />
      ) : (
        <p className="queue-actions">
          <AlertSelect id={`alert-${report.id}`} value={choice} onChange={setChoice} />
          <button type="button" className="bevel" onClick={() => close("noAction")}>{STRINGS.noAction}</button>
          {room ? (
            <button type="button" className="bevel" onClick={() => commands.moderate({ type: "removeRoom", payload: { reportId: report.id, alertAuthorities } })}>{STRINGS.removeRoom}</button>
          ) : (
            <>
              {/* BR-074: a strike needs an account, one per report; a struck report only asks the suspension again. */}
              <button type="button" className="bevel" onClick={() => close("warned")}>{report.struck ? STRINGS.askSuspension : STRINGS.warn}</button>
              {DURATIONS.map((duration) => (
                <button key={duration} type="button" className="bevel" onClick={() => commands.moderate({ type: "expel", payload: { reportId: report.id, duration, alertAuthorities } })}>
                  {STRINGS.expel(STRINGS.durations[duration])}
                </button>
              ))}
              <button type="button" className="bevel" onClick={() => setSevere(true)}>{STRINGS.severe}</button>
            </>
          )}
        </p>
      )}
    </li>
  );
};

/** BR-104: a closed report with its alert, as text only. */
const AlertRow = ({ report }: { report: AlertedReport }) => (
  <li>
    <ReportBody report={report} />
    <p className="small">{STRINGS.closedOn(shortDate(report.closedAt))}</p>
    <p className="small">
      {STRINGS.alertRaised(STRINGS.offences[report.alert.offenceCategory], report.alert.raisedBy, shortDate(report.alert.raisedAt))} —{" "}
      {STRINGS.alertStatus(alertStatus(report.alert))}
    </p>
  </li>
);

/** BR-075: the third active strike asks the moderator; the suspension closes the report. */
const Proposal = ({ proposal }: { proposal: NonNullable<QueueView["proposal"]> }) => {
  const { commands } = useChat();
  const [choice, setChoice] = useState<AlertChoice>("none");
  const target = { accountId: proposal.accountId, reportId: proposal.reportId };
  return (
    <section role="alert" className="queue-proposal">
      <p>{STRINGS.proposal(proposal.activeStrikes)}</p>
      <AlertSelect id="proposal-alert" value={choice} onChange={setChoice} />
      <button type="button" className="bevel primary" onClick={() => commands.moderate({ type: "confirmSuspension", payload: { ...target, alertAuthorities: alertOf(choice) } })}>{STRINGS.suspend}</button>
      <button type="button" className="bevel" onClick={() => commands.moderate({ type: "declineSuspension", payload: target })}>{STRINGS.noSuspend}</button>
    </section>
  );
};

/** UC12: the first 50 open reports in BR-102 order, the suspension proposal (BR-075) and the alerts (BR-104); moderators only. */
export const QueueDialog = () => {
  const { state, commands } = useChat();
  const { queue } = state;
  // Closing a report frees a row: the next one is asked once the page is short (BR-102).
  const short = queue !== undefined && !queue.loading && queue.reports.length < Math.min(queue.total, CAPS.queuePage);
  const shown = queue?.reports.length ?? 0;
  useEffect(() => {
    if (short) commands.refreshQueue();
  }, [short, shown, commands]);
  if (!queue) return null;
  const alerts = queue.tab === "alerts";
  return (
    <Modal labelledBy="queue-title" onClose={() => commands.local({ type: "closeQueue" })}>
      <h2 id="queue-title">{state.moderatorName ? STRINGS.queueTitleOf(state.moderatorName) : STRINGS.queueTitle}</h2>
      <nav className="tabs" aria-label={STRINGS.queue}>
        <button type="button" className="link" aria-current={!alerts} onClick={() => commands.local({ type: "showQueueTab", tab: "open" })}>{STRINGS.tabOpen}</button>
        <button type="button" className="link" aria-current={alerts} onClick={() => commands.showAlerts()}>{STRINGS.tabAlerts}</button>
      </nav>
      {alerts ? (
        <>
          {queue.alerted === undefined && <p className="small">{STRINGS.queueLoading}</p>}
          {queue.alerted?.length === 0 && <p className="small">{STRINGS.alertsEmpty}</p>}
          <ul className="queue">{queue.alerted?.map((report) => <AlertRow key={report.id} report={report} />)}</ul>
        </>
      ) : (
        <>
          {queue.proposal && <Proposal proposal={queue.proposal} />}
          {queue.loading && <p className="small">{STRINGS.queueLoading}</p>}
          {!queue.loading && queue.reports.length === 0 && <p className="small">{STRINGS.queueEmpty}</p>}
          {queue.total > queue.reports.length && <p className="small">{STRINGS.queueCount(queue.reports.length, queue.total)}</p>}
          <ul className="queue">{queue.reports.map((report) => <QueueRow key={report.id} report={report} />)}</ul>
        </>
      )}
    </Modal>
  );
};
