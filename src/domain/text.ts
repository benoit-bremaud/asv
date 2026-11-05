/**
 * Free-text rule BR-090 (issue #91): invisible and direction-changing characters.
 */

/**
 * Controls (C0, DEL, C1), the Arabic letter mark, zero-width space, LRM/RLM, line and paragraph separators, bidi embeddings and
 * overrides, word joiner and invisible operators, bidi isolates and the BOM. The joiners U+200C and
 * U+200D stay allowed: emoji sequences and Persian need them.
 */
const FORBIDDEN_CHAR = /[\p{Cc}\u061C\u200B\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;

/** BR-090. */
export const hasForbiddenChar = (text: string): boolean => FORBIDDEN_CHAR.test(text);
