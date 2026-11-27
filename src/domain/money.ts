export type Cents = number & { readonly __brand: 'Cents' };

export function cents(amount: number): Cents {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Expected integer cents, received: ${String(amount)}`);
  }
  return amount as Cents;
}

export const ZERO_CENTS: Cents = cents(0);

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtractCentsClamped(amount: Cents, deduction: Cents): Cents {
  return cents(Math.max(0, amount - deduction));
}

export function multiplyCents(unitPrice: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a non-negative integer, received: ${String(quantity)}`);
  }
  return cents(unitPrice * quantity);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const val of values) {
    total += val;
  }
  return cents(total);
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b;
}

/**
 * Applies a basis-points percentage (e.g. 1000 bps = 10%) using pure integer
 * half-up rounding, avoiding any floating-point arithmetic.
 */
export function applyBasisPointsHalfUp(amount: Cents, bps: number): Cents {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(`Basis points must be an integer between 0 and 10000, received: ${String(bps)}`);
  }
  if (amount < 0) {
    throw new RangeError(`Cannot apply basis points to negative amount: ${String(amount)}`);
  }
  return cents(Math.floor((amount * bps + 5_000) / 10_000));
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUSD(amount: Cents): string {
  return usdFormatter.format(amount / 100);
}
