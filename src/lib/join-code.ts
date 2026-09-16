/**
 * Codes a student types to join a group.
 *
 * These get read off a projector, written on a whiteboard and copied into a
 * phone, so the alphabet drops every character that is confusable with another
 * in that setting: 0/O/Q, 1/I/L/J, 2/Z, 5/S, 8/B, and U/V. What is left is 21
 * symbols, and 21^6 is 85 million combinations — far more than a university
 * will ever need, while a wrong code only ever lands on "no such group",
 * because the code is the document id.
 *
 * Deliberately NOT normalised by guessing. An earlier draft mapped a typed `O`
 * onto `Q` and `S` onto `5`; since those characters are excluded precisely
 * because nobody can tell them apart, every such mapping is a guess, and a
 * wrong guess turns a code the student read correctly into one that does not
 * exist. Cleaning up whitespace and case is certain; the rest is not, so a
 * character outside the alphabet simply fails the lookup and they retype.
 */
const ALPHABET = '34679ACDEFGHKMNPRTWXY';

export const JOIN_CODE_LENGTH = 6;

/**
 * A random code.
 *
 * NOT a secret and not a security boundary: it protects against typos and
 * against walking into the wrong group, not against someone determined to get
 * into a classmate's match. Every group action re-checks enrolment and
 * membership on the server regardless of how the group was found.
 */
export function generateJoinCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    const index = Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length));
    code += ALPHABET[index];
  }
  return code;
}

/** Upper-cases and strips the spaces and dashes people add when reading aloud. */
export function normaliseJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** Whether a normalised code could possibly be one that was issued. */
export function isPlausibleJoinCode(code: string): boolean {
  if (code.length !== JOIN_CODE_LENGTH) return false;
  return [...code].every((character) => ALPHABET.includes(character));
}
