/**
 * Authority alerts (brick 8c-2, `moderation/02h`, `04`): the offence category a moderator picks (BR-104),
 * the filing the owner records (UC20) and the order of the "alertes" tab. Pure values and checks.
 */
import { hasForbiddenChar } from "./text";

/** `security-and-rgpd.md` §6; always the moderator's choice, never the AI category (ADR-0010). */
export type OffenceCategory = "childAbuse" | "threatToLife" | "terrorism" | "hateOrViolence" | "harassment" | "otherListed";
/** Where the owner filed; typed `17` and `112` on the command line (`moderation/04`). */
export type AlertChannel = "PHAROS" | "police17" | "emergency112" | "PointDeContact";
export type AlertStatus = "pending" | "filed";

/** One alert per report (`moderation/04`), values in clear. */
export interface AuthorityAlert {
  readonly offenceCategory: OffenceCategory;
  /** BR-055: the moderator who raised it, the caller when they phoned 17 or 112. */
  readonly raisedBy: string;
  readonly raisedAt: Date;
  /** Set once the provider accepted the owner alert e-mail. */
  readonly notifiedAt?: Date;
  readonly status: AlertStatus;
  readonly channel?: AlertChannel;
  readonly reference?: string;
  readonly filedAt?: Date;
}

/** `recordFiling` answers: 204, 409, 404 on the owner route. */
export type FilingResult = "filed" | "alreadyFiled" | "noAlert";

export const AUTHORITY_LIMITS = {
  maxReferenceLength: 100,
  /** BR-104: the owner alert is retried for at most 7 days. */
  alertRetryMs: 7 * 24 * 60 * 60_000,
} as const;

const CHANNELS: Readonly<Record<string, AlertChannel>> = {
  PHAROS: "PHAROS",
  "17": "police17",
  "112": "emergency112",
  PointDeContact: "PointDeContact",
};

/** BR-104: PHAROS, 17, 112 or PointDeContact as typed by the owner; anything else is refused. */
export const parseFilingChannel = (typed: string): AlertChannel | undefined =>
  Object.hasOwn(CHANNELS, typed) ? CHANNELS[typed] : undefined;

/** BR-104: 1 to 100 characters following BR-090, checked after trimming. */
export const isFilingReference = (reference: string): boolean => {
  const trimmed = reference.trim();
  return trimmed.length > 0 && [...reference].length <= AUTHORITY_LIMITS.maxReferenceLength && !hasForbiddenChar(trimmed);
};

/** `web-ui/08`: pending alerts first, oldest raised first, then the most recently filed. */
export const sortAlerted = <R extends { readonly alert: Pick<AuthorityAlert, "status" | "raisedAt" | "filedAt"> }>(reports: readonly R[]): R[] => {
  const pending = reports.filter((report) => report.alert.status === "pending");
  const filed = reports.filter((report) => report.alert.status === "filed");
  return [
    ...pending.sort((a, b) => a.alert.raisedAt.getTime() - b.alert.raisedAt.getTime()),
    ...filed.sort((a, b) => (b.alert.filedAt?.getTime() ?? 0) - (a.alert.filedAt?.getTime() ?? 0)),
  ];
};

/** BR-104: the owner alert is due again while not accepted and younger than 7 days. */
export const alertDue = (alert: Pick<AuthorityAlert, "notifiedAt" | "raisedAt">, now: Date): boolean =>
  alert.notifiedAt === undefined && now.getTime() - alert.raisedAt.getTime() < AUTHORITY_LIMITS.alertRetryMs;
