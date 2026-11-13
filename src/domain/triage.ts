/**
 * AI triage of reports (brick 8c, `moderation/02g`, `04`): pseudonymisation (BR-100), daily caps and the
 * urgency floor (BR-101), queue order (BR-102). Pure: the hub calls the `ReportTriage` port and the store.
 */
import type { Report, ReportReason, ReportTargetKind } from "./moderation";
import { foldPseudo, PSEUDO_CHARS } from "./pseudo";

/** BR-101. */
export type TriageCategory = "harassment" | "sexualMinor" | "threat" | "hate" | "spam" | "illegalOther" | "none";
/** `unknown` until a valid triage arrives (BR-101). */
export type Urgency = "unknown" | "low" | "medium" | "high";

/** What the AI suggests, for sorting only; a human decides (ADR-0010). */
export interface Triage {
  readonly category: TriageCategory;
  readonly urgency: Exclude<Urgency, "unknown">;
  readonly summary: string;
}

/** One neutral label and the pseudo it hides (BR-100). */
export interface TriageLabel {
  readonly label: string;
  readonly pseudo: string;
}

/** The only data that leaves asv (BR-100): never an IP, account id, room name or date. */
export interface TriageInput {
  readonly reason: ReportReason;
  readonly targetKind: ReportTargetKind;
  readonly lines: readonly string[];
}

/** V1 values of BR-101, tunable here only. */
export const TRIAGE_LIMITS = {
  callsPerDay: 200,
  callsPerReporterPerDay: 20,
  timeoutMs: 10_000,
  summaryMaxLength: 200,
} as const;

/** `[A]`…`[Z]`, then `[AA]`, `[AB]`… (bijective base 26). */
const labelAt = (index: number): string => {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCodePoint(65 + ((n - 1) % 26)) + name;
  return `[${name}]`;
};

const WORD = new RegExp(`[${PSEUDO_CHARS}]+`, "gu");
const AUTHOR = new RegExp(`^([${PSEUDO_CHARS}]{3,20}): `, "u");
const EDGE = new Set([".", "_", "-"]);
const EMAIL = /[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+/gu;
/** International or French numbers: 8 to 15 digits, optionally `+` or `00` first, up to 3 of space, `.`, `/`, `-` between digits. */
const PHONE = /(?:\+|\b00)?\d(?:[\s./-]{0,3}\d){7,14}/gu;

/** NFKC folds full-width digits and letters; brackets become parentheses so no text can forge a label. */
const normalise = (text: string): string => text.normalize("NFKC").replaceAll("[", "(").replaceAll("]", ")");

/**
 * BR-100: labels the target first when it has a pseudo, then each line's author and every known pseudo
 * written as a whole word (ignoring case and accents, BR-002), in order of first appearance; then masks
 * e-mails and phones. `known` holds the connected and away pseudos when the report was filed; every line
 * author is known too, even one who left. A context line reads `pseudo: text` as the web client builds it;
 * the excerpt of a message report is the target's line, skipped when it repeats the last context line.
 */
export const pseudonymise = (report: Report, known: readonly string[]): { input: TriageInput; labels: TriageLabel[] } => {
  const parsed = report.context.map((raw) => {
    const text = normalise(raw);
    const match = AUTHOR.exec(text);
    return match ? { author: match[1], text: text.slice(match[0].length) } : { author: undefined, text };
  });
  const authors = parsed.flatMap(({ author }) => (author === undefined ? [] : [author]));
  const names = new Map([...known, ...authors].map((pseudo) => [foldPseudo(pseudo), pseudo] as const));
  const labels: TriageLabel[] = [];
  const byFolded = new Map<string, string>();
  const labelOf = (pseudo: string): string => {
    const folded = foldPseudo(pseudo);
    const found = byFolded.get(folded);
    if (found !== undefined) return found;
    const label = labelAt(labels.length);
    byFolded.set(folded, label);
    labels.push({ label, pseudo: names.get(folded) ?? pseudo });
    return label;
  };
  const isName = (word: string) => byFolded.has(foldPseudo(word)) || names.has(foldPseudo(word));
  /** `bob.`, `_bob_` or `-bob` is `bob` when the whole word is nobody; the punctuation around stays. */
  const replaceWord = (word: string): string => {
    if (isName(word)) return labelOf(word);
    let start = 0;
    let end = word.length;
    while (start < end && EDGE.has(word.charAt(start))) start += 1;
    while (end > start && EDGE.has(word.charAt(end - 1))) end -= 1;
    const [before, core, after] = [word.slice(0, start), word.slice(start, end), word.slice(end)];
    return core !== word && core.length > 0 && isName(core) ? before + labelOf(core) + after : word;
  };
  const mask = (text: string): string => text.replace(WORD, replaceWord).replace(EMAIL, "[e-mail]").replace(PHONE, "[téléphone]");
  const line = (author: string | undefined, text: string): string => (author === undefined ? mask(text) : `${labelOf(author)}: ${mask(text)}`);

  if (report.targetPseudo !== undefined) labelOf(report.targetPseudo);
  const lines = parsed.map(({ author, text }) => line(author, text));
  if (report.excerpt !== "") {
    const last = line(report.targetKind === "message" ? report.targetPseudo : undefined, normalise(report.excerpt));
    if (last !== lines.at(-1)) lines.push(last);
  }
  return { input: { reason: report.reason, targetKind: report.targetKind, lines }, labels };
};

/** BR-101: a `seemsMinor` or `illegalContent` report is never below medium. */
const reasonFloor = (reason: ReportReason): Urgency => (reason === "seemsMinor" || reason === "illegalContent" ? "medium" : "unknown");

/** BR-101: the triage with its urgency raised to the reason's floor. */
export const applyFloor = (reason: ReportReason, triage: Triage): Triage =>
  triage.urgency === "low" && reasonFloor(reason) === "medium" ? { ...triage, urgency: "medium" } : triage;

const RANK: Record<Urgency, number> = { high: 0, medium: 1, unknown: 2, low: 3 };

/** BR-102: the urgency a report sorts by; `unknown` takes its reason's floor. */
export const queueUrgency = (report: { readonly reason: ReportReason; readonly triage?: { readonly urgency: Urgency } }): Urgency => {
  const urgency = report.triage?.urgency ?? "unknown";
  return urgency === "unknown" ? reasonFloor(report.reason) : urgency;
};

/** BR-102: high, medium, unknown, low, then oldest first. */
export const sortForQueue = <R extends { readonly reason: ReportReason; readonly createdAt: Date; readonly triage?: { readonly urgency: Urgency } }>(
  reports: readonly R[],
): R[] =>
  [...reports].sort((a, b) => RANK[queueUrgency(a)] - RANK[queueUrgency(b)] || a.createdAt.getTime() - b.createdAt.getTime());

/** Triage calls of the current UTC day: in all and per reporter key (BR-101); restarts with the process. */
export interface TriageQuota {
  readonly day: string;
  readonly total: number;
  readonly byReporter: ReadonlyMap<string, number>;
}

export const emptyTriageQuota: TriageQuota = { day: "", total: 0, byReporter: new Map() };

/**
 * BR-101: counts one call for every reporter key (keyed IP hash, and account id for a member), or answers
 * `undefined` when the day's 200 calls or any key's 20 calls are reached.
 */
export const takeTriageSlot = (quota: TriageQuota, reporterKeys: readonly string[], now: Date): TriageQuota | undefined => {
  const day = now.toISOString().slice(0, 10);
  const current = quota.day === day ? quota : { day, total: 0, byReporter: new Map<string, number>() };
  if (current.total >= TRIAGE_LIMITS.callsPerDay) return undefined;
  if (reporterKeys.some((key) => (current.byReporter.get(key) ?? 0) >= TRIAGE_LIMITS.callsPerReporterPerDay)) return undefined;
  const byReporter = new Map(current.byReporter);
  for (const key of reporterKeys) byReporter.set(key, (byReporter.get(key) ?? 0) + 1);
  return { day, total: current.total + 1, byReporter };
};
