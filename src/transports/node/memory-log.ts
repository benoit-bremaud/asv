import type { ConnectionLine, ConnectionLogStore, ContributionLine } from "../../domain";

/** Lines kept by the Node transport; never written to disk (`platform/04c`, D5). */
export type LogLine =
  | ({ readonly kind: "connection"; readonly closedAt?: Date } & ConnectionLine)
  | ({ readonly kind: "contribution" } & ContributionLine);

/** In-memory connection log for development and tests, bounded to the newest `max` lines. */
export const createMemoryLog = (max = 10_000): ConnectionLogStore & { lines(): readonly LogLine[] } => {
  const lines: LogLine[] = [];
  const push = (line: LogLine): Promise<void> => {
    lines.push(line);
    if (lines.length > max) lines.shift();
    return Promise.resolve();
  };
  return {
    open: (line) => push({ kind: "connection", ...line }),
    close: (connectionId, at) => {
      const index = lines.findLastIndex((line) => line.kind === "connection" && line.connectionId === connectionId);
      const line = lines[index];
      if (line?.kind === "connection") lines[index] = { ...line, closedAt: at };
      return Promise.resolve();
    },
    appendContribution: (line) => push({ kind: "contribution", ...line }),
    lines: () => [...lines],
  };
};
