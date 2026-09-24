import { amountCents, formatPhoneInput, nextAmountText, phoneDigits } from './input';

describe('phone input', () => {
  it('keeps only digits, at most 9', () => {
    expect(phoneDigits('61 555 2046')).toBe('615552046');
    expect(phoneDigits('61-555-2046')).toBe('615552046');
    expect(phoneDigits('6155520461234')).toBe('615552046');
    expect(phoneDigits('')).toBe('');
  });

  it('drops the country code of a pasted number', () => {
    expect(phoneDigits('+252 61 555 2046')).toBe('615552046');
    expect(phoneDigits('252615552046')).toBe('615552046');
  });

  it('groups the digits 2-3-4 while typing', () => {
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput('6')).toBe('6');
    expect(formatPhoneInput('61')).toBe('61');
    expect(formatPhoneInput('615')).toBe('61 5');
    expect(formatPhoneInput('61555')).toBe('61 555');
    expect(formatPhoneInput('6155520')).toBe('61 555 20');
    expect(formatPhoneInput('615552046')).toBe('61 555 2046');
  });
});

describe('amount input', () => {
  it('accepts amounts as they are typed', () => {
    expect(nextAmountText('', '1')).toBe('1');
    expect(nextAmountText('1', '10')).toBe('10');
    expect(nextAmountText('10', '10.')).toBe('10.');
    expect(nextAmountText('10.', '10.5')).toBe('10.5');
    expect(nextAmountText('10.5', '10.55')).toBe('10.55');
    expect(nextAmountText('10.55', '10.5')).toBe('10.5');
    expect(nextAmountText('1', '')).toBe('');
    expect(nextAmountText('', '9999999999.99')).toBe('9999999999.99');
  });

  it('ignores an edit that breaks the rule (TC-13 on the phone)', () => {
    expect(nextAmountText('10.55', '10.555')).toBe('10.55');
    expect(nextAmountText('1.2', '1.2.3')).toBe('1.2');
    expect(nextAmountText('1', '1a')).toBe('1');
    expect(nextAmountText('', '-5')).toBe('');
    expect(nextAmountText('9999999999', '99999999999')).toBe('9999999999');
  });

  it('tidies the text', () => {
    expect(nextAmountText('', '.5')).toBe('0.5');
    expect(nextAmountText('', '007')).toBe('7');
    expect(nextAmountText('', '0')).toBe('0');
    expect(nextAmountText('0', '00.5')).toBe('0.5');
    expect(nextAmountText('10', '10,5')).toBe('10.5');
    expect(nextAmountText('', '$ 12.50')).toBe('12.50');
  });

  it('reads the text as whole cents', () => {
    expect(amountCents('10')).toBe(1000);
    expect(amountCents('10.')).toBe(1000);
    expect(amountCents('10.5')).toBe(1050);
    expect(amountCents('0.07')).toBe(7);
    expect(amountCents('9999999999.99')).toBe(999999999999);
    expect(amountCents('')).toBeNull();
    expect(amountCents('.')).toBeNull();
  });
});
