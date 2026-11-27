import React from 'react';
import { Check, Minus, Plus, Sparkles, Utensils } from 'lucide-react';
import {
  cents,
  FESTIVAL_DAYS,
  formatUSD,
  GARBA_WORKSHOP_DATES,
  type AttendeeCategoryChoice,
  type PassKind,
} from '@domain/index';
import { useCatalogStore } from '../../../stores/catalog-store';
import { Badge } from '../../../ui/Badge';

export interface ExtrasSelectorProps {
  category: AttendeeCategoryChoice;
  passKind: PassKind;
  selectedDays: readonly string[];
  extras: {
    readonly dandiyaPairs: number;
    readonly dinnerDates: readonly string[];
    readonly workshopDates: readonly string[];
  };
  onChangeExtras: (next: {
    dandiyaPairs: number;
    dinnerDates: string[];
    workshopDates: string[];
  }) => void;
}

export function ExtrasSelector({
  category,
  passKind,
  selectedDays,
  extras,
  onChangeExtras,
}: ExtrasSelectorProps): React.ReactElement {
  const getProduct = useCatalogStore((s) => s.getProduct);

  const validDates =
    passKind === 'all_day' ? FESTIVAL_DAYS.map((d) => d.date) : [...selectedDays].sort();
  const validSet = new Set(validDates);

  const dinnerProd = getProduct('DINNER_PLATE');
  const workshopProd = getProduct('GARBA_WORKSHOP');
  const dandiyaProd = getProduct('DANDIYA_PAIR');

  const workshopRemaining = workshopProd?.availability.remaining ?? 2;

  const toggleDinnerDate = (date: string): void => {
    const next = extras.dinnerDates.includes(date)
      ? extras.dinnerDates.filter((d) => d !== date)
      : [...extras.dinnerDates, date].sort();
    onChangeExtras({
      dandiyaPairs: extras.dandiyaPairs,
      dinnerDates: next,
      workshopDates: [...extras.workshopDates],
    });
  };

  const toggleWorkshopDate = (date: string): void => {
    const next = extras.workshopDates.includes(date)
      ? extras.workshopDates.filter((d) => d !== date)
      : [...extras.workshopDates, date].sort();
    onChangeExtras({
      dandiyaPairs: extras.dandiyaPairs,
      dinnerDates: [...extras.dinnerDates],
      workshopDates: next,
    });
  };

  const setDandiyaPairs = (count: number): void => {
    const clamped = Math.max(0, Math.min(20, count));
    onChangeExtras({
      dandiyaPairs: clamped,
      dinnerDates: [...extras.dinnerDates],
      workshopDates: [...extras.workshopDates],
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/15 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#FDF3E4]">Extra Festival Add-Ons</span>
        <span className="text-xs text-white/60">Optional · Printed on boarding pass</span>
      </div>

      {/* 1. Dinner Plate ($12 per person, per attending day) */}
      <div className="space-y-2 pt-1 border-t border-white/10">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-white">
            <Utensils className="h-4 w-4 text-[#D1AC3E]" />
            Dinner Plate ({formatUSD(cents(dinnerProd?.unitPriceCents ?? 1200))}/day)
          </span>
          <span className="text-xs text-white/60">Available on your pass days</span>
        </div>

        {validDates.length === 0 ? (
          <p className="text-xs text-white/50">Select at least one festival day above first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {FESTIVAL_DAYS.filter((d) => validSet.has(d.date)).map((day) => {
              const active = extras.dinnerDates.includes(day.date);
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => toggleDinnerDate(day.date)}
                  aria-pressed={active}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'border-[#C99B24] bg-[#C99B24] text-[#2C2C2C] font-semibold'
                      : 'border-white/20 bg-white/[0.04] text-white/85 hover:border-[#D1AC3E]'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                  <span>Dinner · {day.shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Garba Workshop ($20 — Fri 11 Dec & Sun 13 Dec only, ages 5+) */}
      {category !== 'infant' && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-white">
              <Sparkles className="h-4 w-4 text-[#D1AC3E]" />
              Garba Workshop ({formatUSD(cents(workshopProd?.unitPriceCents ?? 2000))} each)
            </span>
            {workshopRemaining <= 0 ? (
              <Badge variant="sold-out">Sold Out</Badge>
            ) : workshopRemaining <= 5 ? (
              <Badge variant="low-stock">Only {workshopRemaining} spots left</Badge>
            ) : null}
          </div>
          <p className="text-xs text-white/60">
            Runs on <strong>Fri 11 Dec</strong> and <strong>Sun 13 Dec</strong> only (requires an
            entry pass valid on that day).
          </p>

          <div className="flex flex-wrap gap-2">
            {FESTIVAL_DAYS.filter((d) => GARBA_WORKSHOP_DATES.includes(d.date)).map((day) => {
              const attendingThatDay = validSet.has(day.date);
              const active = extras.workshopDates.includes(day.date);
              const disabled = !attendingThatDay || (workshopRemaining <= 0 && !active);
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleWorkshopDate(day.date)}
                  aria-pressed={active}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                    disabled
                      ? 'border-white/10 bg-white/[0.02] text-white/35 cursor-not-allowed'
                      : active
                        ? 'border-[#C99B24] bg-[#C99B24] text-[#2C2C2C] font-semibold cursor-pointer'
                        : 'border-white/20 bg-white/[0.04] text-white/85 hover:border-[#D1AC3E] cursor-pointer'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                  <span>
                    Workshop · {day.shortLabel}
                    {!attendingThatDay ? ' (Pass required)' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Dandiya Sticks Souvenir ($5/pair) */}
      <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block text-xs sm:text-sm font-medium text-white">
            Dandiya Sticks Pair ({formatUSD(cents(dandiyaProd?.unitPriceCents ?? 500))}/pair)
          </span>
          <span className="text-xs text-white/60">Decorated wooden souvenir pair</span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.04] p-1">
          <button
            type="button"
            aria-label="Decrease Dandiya pairs"
            disabled={extras.dandiyaPairs <= 0}
            onClick={() => setDandiyaPairs(extras.dandiyaPairs - 1)}
            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center font-semibold text-sm" aria-live="polite">
            {extras.dandiyaPairs}
          </span>
          <button
            type="button"
            aria-label="Increase Dandiya pairs"
            disabled={extras.dandiyaPairs >= 20}
            onClick={() => setDandiyaPairs(extras.dandiyaPairs + 1)}
            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
