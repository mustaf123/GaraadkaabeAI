// Cleaning what the user types into the phone and amount fields, before it reaches
// screen state. Amounts stay text and become whole cents by reading the digits,
// never by float maths (CLAUDE.md §4).

// Any text -> the local number, at most 9 digits. A pasted "+252 61 555 2046" loses
// its country code first.
export function phoneDigits(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('252')) digits = digits.slice(3);
  return digits.slice(0, 9);
}

// "615552" -> "61 555 2": groups of 2, 3 and 4 while the number is typed.
export function formatPhoneInput(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9)].filter(Boolean).join(' ');
}

// What the field may hold while typing: the server's rule (at most 10 digits before
// the dot, at most 2 after), with the parts not typed yet allowed to be empty.
const AMOUNT_TYPING = /^\d{0,10}(\.\d{0,2})?$/;

// The amount text after an edit. An edit that breaks the rule is ignored (the
// previous text stays). A comma counts as the dot (some keyboards show one).
// ".5" becomes "0.5", and leading zeros go: "007" becomes "7".
export function nextAmountText(previous: string, typed: string): string {
  const text = typed.replace(/,/g, '.').replace(/[\s$]/g, '');
  if (!AMOUNT_TYPING.test(text)) return previous;
  if (text.startsWith('.')) return `0${text}`;
  return text.replace(/^0+(?=\d)/, '');
}

// "10.5" -> 1050, "10." -> 1000, "" -> null.
export function amountCents(text: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
