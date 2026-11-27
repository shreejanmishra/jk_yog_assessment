import React from 'react';
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

  const toggleDay = (date: string): void => {
    if (selectedDays.includes(date)) {
      onChangeDays(selectedDays.filter((d) => d !== date));
    } else {
      onChangeDays([...selectedDays, date].sort());
    }
  };

  if (passKind === 'family_pass') {
    return (
      <div className="rounded-xl border border-[#C99B24] bg-[#C99B24]/15 p-3.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[#FDF3E4]">Included in Family Pass ($40/day)</span>
          <Badge variant="gold">Family Group</Badge>
        </div>
        <p className="mt-1 text-xs text-white/75">
          Valid on: {selectedDays.join(', ')}. You can switch back to individual passes anytime from
          the Family Pass banner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {category !== 'infant' ? (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-white">Entry Pass Type</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Day Pass Option */}
            <button
              type="button"
              onClick={() => onChangePassKind('day_pass')}
              aria-pressed={passKind === 'day_pass'}
              className={`text-left rounded-xl border p-3.5 transition-colors cursor-pointer ${
                passKind === 'day_pass'
                  ? 'border-[#C99B24] bg-[#C99B24]/15'
                  : 'border-white/20 bg-white/[0.04] hover:border-white/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-white">
                  {dayPassProduct?.name ?? 'Day Pass'}
                </span>
                <span className="font-bold text-sm text-[#D1AC3E]">
                  {formatUSD(cents(dayPassProduct?.unitPriceCents ?? (category === 'adult' ? 1500 : 800)))}
                  /day
                </span>
              </div>
              <p className="mt-1 text-xs text-white/65">
                Pick any single evening or combination of festival days.
              </p>
            </button>

            {/* All-Day Pass Option (handles Sold Out gracefully!) */}
            {(() => {
              const soldOut = (allDayProduct?.availability.remaining ?? 0) <= 0;
              const selected = passKind === 'all_day';
              return (
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => !soldOut && onChangePassKind('all_day')}
                  aria-pressed={selected}
                  className={`text-left rounded-xl border p-3.5 transition-colors ${
                    soldOut
                      ? 'border-white/10 bg-white/[0.02] opacity-65 cursor-not-allowed'
                      : selected
                        ? 'border-[#C99B24] bg-[#C99B24]/15 cursor-pointer'
                        : 'border-white/20 bg-white/[0.04] hover:border-white/40 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-white">
                      {allDayProduct?.name ?? 'All-Day Pass'}
                    </span>
                    {soldOut ? (
                      <Badge variant="sold-out">Sold Out</Badge>
                    ) : (
                      <span className="font-bold text-sm text-[#D1AC3E]">
                        {formatUSD(cents(allDayProduct?.unitPriceCents ?? 3000))} flat
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/65">
                    {soldOut
                      ? 'All-Day Adult Passes are sold out — select Day Pass days instead.'
                      : 'Covers all 5 festival days (Dec 10–14) at a discounted flat rate.'}
                  </p>
                </button>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#28A736]/50 bg-[#28A736]/10 px-3.5 py-2.5 text-xs text-[#4CC75A]">
          Toddlers under age 5 enter <strong>Free ($0)</strong>. Select the festival days they will
          attend with their guardian so we include them on your gate pass.
        </div>
      )}

      {/* Day Picker Chips (shown for day_pass and free_infant) */}
      {(passKind === 'day_pass' || passKind === 'free_infant') && (
        <div>
          <span className="block text-sm font-medium text-white mb-2">
            Select Attending Festival Day(s)
          </span>
          <div className="flex flex-wrap gap-2">
            {FESTIVAL_DAYS.map((day) => {
              const isPast = day.date < todayIso;
              const active = selectedDays.includes(day.date);
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={isPast}
                  onClick={() => toggleDay(day.date)}
                  aria-pressed={active}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                    isPast
                      ? 'border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed'
                      : active
                        ? 'border-[#C99B24] bg-[#C99B24] text-[#2C2C2C] font-semibold cursor-pointer'
                        : 'border-white/25 bg-white/[0.05] text-white hover:border-[#D1AC3E] cursor-pointer'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                  <span>{day.shortLabel}</span>
                </button>
              );
            })}
          </div>
          <FieldError message={error} />
        </div>
      )}

      {passKind === 'all_day' && (
        <p className="text-xs text-[#4CC75A]">
          ✓ Valid on all 5 festival evenings: Thu 10 Dec through Mon 14 Dec 2026.
        </p>
      )}
    </div>
  );
}
