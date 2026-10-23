import type { ConnectionLine, ConnectionLogStore, ContributionLine } from "../../domain";

/** Lines kept by the Node transport; never written to disk (`platform/04c`, D5). */
export type LogLine =
  | ({ readonly kind: "connection"; readonly closedAt?: Date } & ConnectionLine)
  | ({ readonly kind: "contribution" } & ContributionLine);

/** In-memory connection log for development and tests, bounded to the newest `max` lines. */
export const createMemoryLog = (max = 10_000): ConnectionLogStore & { lines(): readonly LogLine[] } => {
  let lines: LogLine[] = [];
  const push = (line: LogLine) => {
    lines = [...lines, line].slice(-max);
  };
  return {
    open: async (line) => push({ kind: "connection", ...line }),
    close: async (connectionId, at) => {
      lines = lines.map((line) =>
        line.kind === "connection" && line.connectionId === connectionId ? { ...line, closedAt: at } : line,
      );
    },
    appendContribution: async (line) => push({ kind: "contribution", ...line }),
    lines: () => lines,
  };
};
