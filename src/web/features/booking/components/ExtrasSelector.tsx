import React from 'react';
import { Check, Minus, Plus } from 'lucide-react';
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
    <div className="divide-y divide-white/10 border-y border-white/10">
      {/* 1. Dinner plate */}
      <div className="py-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <span className="text-sm font-medium text-white">Dinner plate</span>
            <p className="mt-0.5 text-xs text-white/55">
              Vegetarian evening meal on any evening covered by your pass.
            </p>
          </div>
          <span className="tabular shrink-0 text-sm text-bright-gold">
            {formatUSD(cents(dinnerProd?.unitPriceCents ?? 1200))} / evening
          </span>
        </div>

        <div className="mt-3">
          {validDates.length === 0 ? (
            <p className="text-xs text-white/45">Select at least one evening above first.</p>
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
                    className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary font-semibold text-primary-dark'
                        : 'border-white/20 text-white/80 hover:border-bright-gold hover:text-white'
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span>{day.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. Garba workshop (Fri 11 & Sun 13 Dec, ages 5+) */}
      {category !== 'infant' && (
        <div className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">Garba workshop</span>
                {workshopRemaining <= 0 ? (
                  <Badge variant="sold-out">Sold out</Badge>
                ) : workshopRemaining <= 5 ? (
                  <Badge variant="low-stock">{workshopRemaining} left</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-white/55">
                Runs on Friday 11 and Sunday 13 December only (requires an entry pass for that
                evening).
              </p>
            </div>
            <span className="tabular shrink-0 text-sm text-bright-gold">
              {formatUSD(cents(workshopProd?.unitPriceCents ?? 2000))} / session
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
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
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3 py-1 text-xs font-medium transition-colors ${
                    disabled
                      ? 'cursor-not-allowed border-white/10 text-white/35'
                      : active
                        ? 'cursor-pointer border-primary bg-primary font-semibold text-primary-dark'
                        : 'cursor-pointer border-white/20 text-white/80 hover:border-bright-gold hover:text-white'
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>
                    {day.shortLabel}
                    {!attendingThatDay ? ' (pass needed)' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Dandiya sticks */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div>
          <span className="text-sm font-medium text-white">Dandiya sticks</span>
          <p className="mt-0.5 text-xs text-white/55">
            Wooden pair to collect at the gate ({formatUSD(cents(dandiyaProd?.unitPriceCents ?? 500))}{' '}
            per pair).
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-control border border-white/20 p-1">
          <button
            type="button"
            aria-label="Decrease Dandiya pairs"
            disabled={extras.dandiyaPairs <= 0}
            onClick={() => setDandiyaPairs(extras.dandiyaPairs - 1)}
            className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-sm text-white/80 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="tabular w-8 text-center text-sm font-semibold" aria-live="polite">
            {extras.dandiyaPairs}
          </span>
          <button
            type="button"
            aria-label="Increase Dandiya pairs"
            disabled={extras.dandiyaPairs >= 20}
            onClick={() => setDandiyaPairs(extras.dandiyaPairs + 1)}
            className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-sm text-white/80 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
