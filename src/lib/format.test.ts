import { formatCents, formatMoney, formatPhone, formatSignedMoney, maskPhone, toCents } from './format';

describe('money', () => {
  it('reads amounts as whole cents, without float maths', () => {
    expect(toCents('121.5')).toBe(12150);
    expect(toCents(121.5)).toBe(12150);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('0.07')).toBe(7);
    expect(toCents('100')).toBe(10000);
    expect(toCents('9999999999.99')).toBe(999999999999);
    expect(toCents('-5.50')).toBe(-550);
    expect(toCents('-0.00')).toBe(0);
  });

  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['10.555', '1e3', 'abc', '', '1,000.00', '.5', NaN, Infinity]) {
      expect(() => toCents(bad as string | number)).toThrow();
    }
  });

  it('formats as $1,234.50', () => {
    expect(formatMoney('1234.5')).toBe('$1,234.50');
    expect(formatMoney('0')).toBe('$0.00');
    expect(formatMoney(100)).toBe('$100.00');
    expect(formatMoney('1000000')).toBe('$1,000,000.00');
    expect(formatCents(-123450)).toBe('-$1,234.50');
  });

  it('signs row amounts with a real minus sign', () => {
    expect(formatSignedMoney('10.00', 'sent')).toBe('−$10.00');
    expect(formatSignedMoney('25', 'received')).toBe('+$25.00');
  });
});

describe('phone numbers', () => {
  it('formats and masks a 9-digit number', () => {
    expect(formatPhone('615552046')).toBe('+252 61 555 2046');
    expect(maskPhone('615552046')).toBe('61X XXX 2046');
  });

  it('leaves anything else alone', () => {
    expect(maskPhone('12345')).toBe('12345');
    expect(formatPhone('')).toBe('');
  });
});
