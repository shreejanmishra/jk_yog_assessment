import { EVENT_METADATA } from '@domain/catalog';

export interface Clock {
  now(): Date;
  nowIso(): string;
  todayFestivalIsoDate(): string;
}

function formatDateInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '11';
  const day = parts.find((p) => p.type === 'day')?.value ?? '26';
  return `${year}-${month}-${day}`;
}

export function createClock(fixedNow?: Date): Clock {
  const resolveDate = (): Date => {
    if (fixedNow) return fixedNow;
    const override = process.env.BOOKING_CLOCK_OVERRIDE?.trim();
    if (override) {
      const parsed = new Date(override);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  };

  return {
    now: resolveDate,
    nowIso: () => resolveDate().toISOString(),
    todayFestivalIsoDate: () => formatDateInTimezone(resolveDate(), EVENT_METADATA.timezone),
  };
}
