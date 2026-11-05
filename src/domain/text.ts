/**
 * Free-text rule BR-090 (issue #91): invisible and direction-changing characters.
 */

/**
 * Controls (C0, DEL, C1), the Arabic letter mark, zero-width space, LRM/RLM, line and paragraph separators, bidi embeddings and
 * overrides, word joiner and invisible operators, bidi isolates, deprecated format characters, the
 * BOM, interlinear annotations, and characters shown as blanks (soft hyphen, Hangul fillers, blank braille). The joiners U+200C and
 * U+200D stay allowed: emoji sequences and Persian need them. The combining grapheme joiner U+034F
 * sits outside the class, where a combining mark is not misread.
 */
const FORBIDDEN_CHAR = /[\p{Cc}\u00AD\u061C\u115F\u1160\u180E\u200B\u200E\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]|\u034F/u;

/** BR-090: true when the text holds a character that hides or reorders what is displayed (`gpj.<RLO>exe`). */
export const hasForbiddenChar = (text: string): boolean => FORBIDDEN_CHAR.test(text);
