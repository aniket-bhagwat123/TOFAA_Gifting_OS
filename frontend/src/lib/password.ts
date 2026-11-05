const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O: easy to read aloud
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l
const DIGITS = "23456789"; // no 0/1
const SYMBOLS = "!@#$%^&*_-+=";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

function randomInt(max: number) {
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}
const pick = (set: string) => set[randomInt(set.length)];

/** Cryptographically random password with at least one of each character class. */
export function generatePassword(length = 16): string {
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

export interface PasswordRule { id: string; label: string; met: boolean }

export function passwordRules(value: string): PasswordRule[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN} characters`, met: value.length >= PASSWORD_MIN },
    { id: "case", label: "Upper and lower case letters", met: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { id: "number", label: "A number", met: /\d/.test(value) },
    { id: "symbol", label: "A symbol (like ! or @)", met: /[^A-Za-z0-9]/.test(value) }
  ];
}

/** 0–4. Only length is required by the server; the rest guide people to a stronger choice. */
export function passwordStrength(value: string): { score: number; label: string } {
  if (!value) return { score: 0, label: "" };
  const met = passwordRules(value).filter((rule) => rule.met).length;
  const bonus = value.length >= 12 ? 1 : 0;
  const score = value.length < PASSWORD_MIN ? 1 : Math.min(4, Math.max(1, met - 1 + bonus));
  return { score, label: ["", "Too weak", "Fair", "Good", "Strong"][score] };
}
