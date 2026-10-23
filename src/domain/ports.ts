/**
 * Ports the hub calls; transports implement them (`platform/03`, `platform/04c`).
 * Types only, so the domain stays pure.
 */

/** One line per socket connection, opened on entry or resume (BR-060). */
export interface ConnectionLine {
  readonly connectionId: string;
  readonly ip: string;
  readonly port?: number;
  readonly protocols: string;
  readonly pseudo: string;
  readonly accountId?: string;
  readonly openedAt: Date;
}

/** One line per created content, never the content itself (BR-060). */
export interface ContributionLine {
  readonly connectionId: string;
  readonly protocols: string;
  readonly at: Date;
}

/** Legal connection and contribution log (BR-060, ADR-0014); every write may fail. */
export interface ConnectionLogStore {
  open(line: ConnectionLine): Promise<void>;
  close(connectionId: string, at: Date): Promise<void>;
  appendContribution(line: ContributionLine): Promise<void>;
}
