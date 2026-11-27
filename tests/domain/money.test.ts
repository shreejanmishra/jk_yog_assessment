import { describe, expect, it } from 'vitest';
import {
  addCents,
  applyBasisPointsHalfUp,
  cents,
  formatUSD,
  multiplyCents,
  subtractCentsClamped,
  sumCents,
} from '@domain/money';

describe('domain/money — integer cents arithmetic', () => {
  it('rejects non-integer floating point cents so $146.70000000000002 is impossible', () => {
    expect(() => cents(146.7)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('computes 10% (1000 bps) on $146.70 cleanly in integer cents without float drift', () => {
    const subtotal = cents(14670); // $146.70
    const discount = applyBasisPointsHalfUp(subtotal, 1000);
    const total = subtractCentsClamped(subtotal, discount);

    expect(discount).toBe(1467);
    expect(total).toBe(13203);
    expect(formatUSD(total)).toBe('$132.03');
  });

  it('rounds half-up accurately on fractional cent percentages', () => {
    // 10% of $1.55 (155 cents) = 15.5 cents -> rounds half-up to 16 cents
    expect(applyBasisPointsHalfUp(cents(155), 1000)).toBe(16);
    // 10% of $1.54 (154 cents) = 15.4 cents -> rounds down to 15 cents
    expect(applyBasisPointsHalfUp(cents(154), 1000)).toBe(15);
  });

  it('clamps deductions at zero so totals never become negative', () => {
    expect(subtractCentsClamped(cents(1500), cents(2000))).toBe(0);
  });

  it('adds, multiplies, and sums integer cents reliably', () => {
    const line1 = multiplyCents(cents(1500), 3);
    const line2 = multiplyCents(cents(800), 2);
    expect(addCents(line1, line2)).toBe(6100);
    expect(sumCents([line1, line2, cents(500)])).toBe(6600);
  });
});
