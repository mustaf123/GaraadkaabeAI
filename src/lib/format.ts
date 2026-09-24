// Formatting money and phone numbers for display.
//
// Money: the database sends numeric(12,2) as a string or a number ("121.5", 121.5).
// It is turned into whole cents by reading the digits, never by float maths, then
// shown as $1,234.50 (CLAUDE.md §4).

const MONEY = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

// "121.5" -> 12150. Throws on anything that is not a plain amount with at most 2 decimals.
export function toCents(value: string | number): number {
  const text = typeof value === 'number' ? String(value) : value.trim();
  const match = MONEY.exec(text);
  if (!match) throw new Error(`not a money amount: ${text}`);
  const [, minus, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error(`amount too large: ${text}`);
  return minus && cents !== 0 ? -cents : cents;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 123450 -> "$1,234.50" (a negative amount -> "-$1,234.50").
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`not a whole number of cents: ${cents}`);
  const abs = Math.abs(cents);
  const text = `$${group(String(Math.floor(abs / 100)))}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${text}` : text;
}

export function formatMoney(value: string | number): string {
  return formatCents(toCents(value));
}

// A row amount: "−$10.00" for money sent (a real minus sign, U+2212), "+$25.00" received.
export function formatSignedMoney(value: string | number, direction: 'sent' | 'received'): string {
  const text = formatCents(Math.abs(toCents(value)));
  return direction === 'sent' ? `−${text}` : `+${text}`;
}

// "615552046" -> "+252 61 555 2046"
export function formatPhone(phone: string): string {
  if (!/^\d{9}$/.test(phone)) return phone;
  return `+252 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5)}`;
}

// "615552046" -> "61X XXX 2046" (the same mask the server uses)
export function maskPhone(phone: string): string {
  if (!/^\d{9}$/.test(phone)) return phone;
  return `${phone.slice(0, 2)}X XXX ${phone.slice(5)}`;
}
