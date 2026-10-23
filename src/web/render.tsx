import type { ReactNode } from "react";

/** BR-022: the fixed smiley whitelist (`web-ui/04`). Codes render as symbols, never as HTML. */
export const SMILEYS: Readonly<Record<string, string>> = {
  ":caramel:": "🍬",
  ":)": "🙂",
  ":(": "🙁",
  ";)": "😉",
  ":D": "😄",
  ":P": "😛",
  ":o": "😮",
  "<3": "❤️",
};

const escape = (code: string) => code.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
// Longest codes first, so `:caramel:` wins over any shorter prefix.
const PATTERN = new RegExp(
  `(${Object.keys(SMILEYS).sort((a, b) => b.length - a.length).map(escape).join("|")})`,
  "g",
);

/** The single place that turns chat text into nodes: text nodes and smiley spans only (BR-022). */
export const renderText = (text: string): ReactNode[] => {
  let offset = 0;
  return text.split(PATTERN).flatMap<ReactNode>((part) => {
    // The character offset is a stable key: the text of a line never changes.
    const at = offset;
    offset += part.length;
    if (part === "") return [];
    const symbol = SMILEYS[part];
    return symbol === undefined
      ? [part]
      : [<span key={at} role="img" aria-label={part} className="smiley">{symbol}</span>];
  });
};
