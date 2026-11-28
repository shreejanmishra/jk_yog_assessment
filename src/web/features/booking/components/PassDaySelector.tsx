import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
import {
  cents,
  FESTIVAL_DAYS,
  formatUSD,
  type AttendeeCategoryChoice,
  type PassKind,
} from '@domain/index';
import { useCatalogStore } from '../../../stores/catalog-store';
import { Badge } from '../../../ui/Badge';
import { FieldError } from '../../../ui/TextField';

export interface PassDaySelectorProps {
  category: AttendeeCategoryChoice;
  passKind: PassKind;
  selectedDays: readonly string[];
  onChangePassKind: (kind: PassKind) => void;
  onChangeDays: (days: string[]) => void;
  error?: string | null;
}

export function PassDaySelector({
  category,
  passKind,
  selectedDays,
  onChangePassKind,
  onChangeDays,
  error,
}: PassDaySelectorProps): React.ReactElement {
  const getProduct = useCatalogStore((s) => s.getProduct);
  const catalog = useCatalogStore((s) => s.catalog);
  const todayIso = catalog?.event.todayIsoDate ?? '2026-11-26';

  const dayPassProduct = getProduct(
    category === 'adult' ? 'DAY_PASS_ADULT' : 'DAY_PASS_CHILD',
  );
  const allDayProduct = getProduct(
    category === 'adult' ? 'ALL_DAY_ADULT' : 'ALL_DAY_CHILD',
  );

  const daySoldOut =
    category !== 'infant' &&
    catalog !== null &&
    (dayPassProduct?.availability.remaining ?? 0) <= 0;
  const allDaySoldOut =
    category !== 'infant' &&
    (catalog !== null
      ? (allDayProduct?.availability.remaining ?? 0) <= 0
      : category === 'adult');

  // If one pass tier sells out while the other is still available, move selection automatically.
  useEffect(() => {
    if (category === 'infant') return;
    if (passKind === 'day_pass' && daySoldOut && !allDaySoldOut) {
      onChangePassKind('all_day');
    } else if (passKind === 'all_day' && allDaySoldOut && !daySoldOut) {
      onChangePassKind('day_pass');
    }
  }, [category, passKind, daySoldOut, allDaySoldOut, onChangePassKind]);

  const toggleDay = (date: string): void => {
    if (selectedDays.includes(date)) {
      onChangeDays(selectedDays.filter((d) => d !== date));
    } else {
      onChangeDays([...selectedDays, date].sort());
    }
  };

  if (passKind === 'family_pass') {
    return (
      <div className="rounded-control border border-gold/50 px-4 py-3.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-cream">Included in $40.00 Family Pass</span>
          <Badge variant="gold">Family pass</Badge>
        </div>
        <p className="mt-1 text-xs text-white/60">
          Valid on {selectedDays.join(', ')}. You can switch back to individual passes from the
          family pass bar above.
        </p>
      </div>
    );
  }

  const daySelected = passKind === 'day_pass' && !daySoldOut;
  const allDaySelected = passKind === 'all_day' && !allDaySoldOut;

  return (
    <div className="space-y-5">
      {category !== 'infant' ? (
        <div>
          <span className="mb-2 block text-sm font-medium text-white/90">Pass type</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={daySoldOut}
              onClick={() => !daySoldOut && onChangePassKind('day_pass')}
              aria-pressed={daySelected}
              className={`rounded-control border p-4 text-left transition-colors ${
                daySoldOut
                  ? 'cursor-not-allowed border-white/10 opacity-60'
                  : daySelected
                    ? 'cursor-pointer border-primary bg-primary/10'
                    : 'cursor-pointer border-white/15 hover:border-white/35'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  {dayPassProduct?.name ?? (category === 'adult' ? 'Day Pass – Adult' : 'Day Pass – Child')}
                </span>
                {daySoldOut ? (
                  <Badge variant="sold-out">Sold out</Badge>
                ) : (
                  <span className="tabular text-sm font-semibold text-bright-gold">
                    {formatUSD(
                      cents(dayPassProduct?.unitPriceCents ?? (category === 'adult' ? 1500 : 800)),
                    )}{' '}
                    / evening
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/60">
                {daySoldOut
                  ? 'Sold out — no evening day passes remaining.'
                  : 'Choose one evening or any combination of evenings.'}
              </p>
            </button>

            <button
              type="button"
              disabled={allDaySoldOut}
              onClick={() => !allDaySoldOut && onChangePassKind('all_day')}
              aria-pressed={allDaySelected}
              className={`rounded-control border p-4 text-left transition-colors ${
                allDaySoldOut
                  ? 'cursor-not-allowed border-white/10 opacity-60'
                  : allDaySelected
                    ? 'cursor-pointer border-primary bg-primary/10'
                    : 'cursor-pointer border-white/15 hover:border-white/35'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  {allDayProduct?.name ?? (category === 'adult' ? 'All-Day Pass – Adult' : 'All-Day Pass – Child')}
                </span>
                {allDaySoldOut ? (
                  <Badge variant="sold-out">Sold out</Badge>
                ) : (
                  <span className="tabular text-sm font-semibold text-bright-gold">
                    {formatUSD(cents(allDayProduct?.unitPriceCents ?? 3000))}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/60">
                {allDaySoldOut
                  ? daySoldOut
                    ? 'Sold out — no all-day passes remaining.'
                    : 'Sold out — choose evening day passes instead.'
                  : 'Covers all five evenings (10 – 14 December).'}
              </p>
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-control border border-success/40 px-4 py-3 text-xs leading-relaxed text-success-on-dark">
          Children under 5 enter free ($0.00). Pick the evenings they will attend with their parent
          or guardian so they are included on your gate pass.
        </p>
      )}

      {(passKind === 'day_pass' || passKind === 'free_infant') && (
        <div data-has-violation={error ? 'true' : undefined}>
          <span className="mb-2 block text-sm font-medium text-white/90">Evenings attending</span>
          <div className="flex flex-wrap gap-2">
            {FESTIVAL_DAYS.map((day) => {
              const isPast = day.date < todayIso;
              const disabled = isPast || (passKind === 'day_pass' && daySoldOut);
              const active = !disabled && selectedDays.includes(day.date);
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && toggleDay(day.date)}
                  aria-pressed={active}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-control border px-3.5 py-1.5 text-sm transition-colors ${
                    disabled
                      ? 'cursor-not-allowed border-white/10 text-white/30'
                      : active
                        ? 'cursor-pointer border-primary bg-primary font-semibold text-primary-dark'
                        : 'cursor-pointer border-white/20 text-white/85 hover:border-bright-gold hover:text-white'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />}
                  <span>{day.shortLabel}</span>
                </button>
              );
            })}
          </div>
          <FieldError message={error} />
        </div>
      )}

      {passKind === 'all_day' && !allDaySoldOut && (
        <p className="text-xs text-success-on-dark">
          Valid on all five evenings: Thursday 10 – Monday 14 December 2026.
        </p>
      )}
    </div>
  );
}
