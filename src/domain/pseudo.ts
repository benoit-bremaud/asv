/**
 * Pseudo rules BR-001 to BR-003 (study `entry/07-class-domain-api`).
 */

/** BR-003, compared on the folded form. */
const RESERVED_WORDS = ["admin", "modo", "moderateur", "asv"] as const;

/** BR-001: ASCII and French letters, digits, `_`, `-`, `.`; 3 to 20 code points. */
/** BR-001 characters, as a regex class body; room names reuse it (BR-030). */
export const PSEUDO_CHARS = "A-Za-z0-9_.\\-àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ";
const PSEUDO_PATTERN = new RegExp(`^[${PSEUDO_CHARS}]{3,20}$`, "u");

/** NFC form, the one checked and stored, so `é` typed either way counts once. */
export const canonicalPseudo = (raw: string): string => raw.normalize("NFC");

/** Lower case without accents: the key for uniqueness (BR-002) and reserved words (BR-003). */
export const foldPseudo = (pseudo: string): string =>
  pseudo.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** BR-001. */
export const hasValidPseudoFormat = (pseudo: string): boolean =>
  PSEUDO_PATTERN.test(canonicalPseudo(pseudo));

/** BR-003: a reserved word anywhere in the pseudo refuses it. */
export const containsReservedWord = (pseudo: string): boolean => {
  const folded = foldPseudo(pseudo);
  return RESERVED_WORDS.some((word) => folded.includes(word));
};
