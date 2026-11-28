import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { ProductDTO } from '@contract/index';
import { cents, EVENT_METADATA, FESTIVAL_DAYS, formatUSD } from '@domain/index';
import { useCatalogStore } from '../../stores/catalog-store';
import { Button } from '../../ui/Button';

interface PriceRow {
  label: string;
  note?: string;
  price: string;
  status?: { tone: 'sold-out' | 'low'; text: string } | null;
}

function PriceList({ rows }: { rows: readonly PriceRow[] }): React.ReactElement {
  return (
    <ul className="divide-y divide-white/10 border-y border-white/10 text-sm">
      {rows.map((row) => (
        <li key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <span className="text-white/85">
            {row.label}
            {row.note && <span className="block text-xs text-white/50">{row.note}</span>}
          </span>
          {row.status?.tone === 'sold-out' ? (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-error-on-dark">
              {row.status.text}
            </span>
          ) : (
            <span className="tabular shrink-0 text-right text-white">
              {row.price}
              {row.status?.tone === 'low' && (
                <span className="block text-xs text-warning-on-dark">{row.status.text}</span>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Festival banner.
 * - Uses iOS squircle container rounding (`rounded-container`) and the sacred mandala + Om SVG
 *   artwork extracted from the design sheet while preserving brand colours and existing copy.
 * - Collapsed, the banner has a fixed height; overflowing details fade out behind "Show full details".
 * - The Book now button sits in a footer bar outside the clipped area so it is never pushed out of view.
 */
export function HeroBanner(): React.ReactElement {
  const navigate = useNavigate();
  const catalog = useCatalogStore((s) => s.catalog);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;
    const measure = (): void => setIsOverflowing(el.scrollHeight > el.clientHeight + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, catalog]);

  const product = (code: ProductDTO['code']): ProductDTO | undefined =>
    catalog?.products.find((p) => p.code === code);
  const priceOf = (code: ProductDTO['code'], fallbackCents: number): string =>
    formatUSD(cents(product(code)?.unitPriceCents ?? fallbackCents));
  const soldOut = (code: ProductDTO['code']): PriceRow['status'] => {
    if (!catalog) return null;
    const p = product(code);
    return !p || p.availability.remaining <= 0 ? { tone: 'sold-out', text: 'Sold out' } : null;
  };

  const workshopLeft = catalog ? (product('GARBA_WORKSHOP')?.availability.remaining ?? 0) : undefined;
  const workshopStatus: PriceRow['status'] =
    workshopLeft === 0
      ? { tone: 'sold-out', text: 'Sold out' }
      : workshopLeft !== undefined && workshopLeft <= 5
        ? { tone: 'low', text: `${workshopLeft} ${workshopLeft === 1 ? 'place' : 'places'} left` }
        : null;

  const ticketRows: PriceRow[] = [
    {
      label: 'Day pass, adult (12+)',
      price: `${priceOf('DAY_PASS_ADULT', 1500)} / evening`,
      status: soldOut('DAY_PASS_ADULT'),
    },
    {
      label: 'Day pass, child (5–11)',
      price: `${priceOf('DAY_PASS_CHILD', 800)} / evening`,
      status: soldOut('DAY_PASS_CHILD'),
    },
    {
      label: 'All-day pass, adult',
      price: priceOf('ALL_DAY_ADULT', 6000),
      status: soldOut('ALL_DAY_ADULT') ?? { tone: 'sold-out', text: 'Sold out' },
    },
    {
      label: 'All-day pass, child',
      price: priceOf('ALL_DAY_CHILD', 3000),
      status: soldOut('ALL_DAY_CHILD'),
    },
    {
      label: 'Family pass',
      note: '2 adults and 2 children, one evening',
      price: priceOf('FAMILY_PASS', 4000),
      status: soldOut('FAMILY_PASS'),
    },
    { label: 'Under 5', price: 'Free' },
  ];

  const extraRows: PriceRow[] = [
    {
      label: 'Dinner plate',
      note: 'Per person, per evening',
      price: priceOf('DINNER_PLATE', 1200),
      status: soldOut('DINNER_PLATE'),
    },
    {
      label: 'Garba workshop',
      note: 'Fri 11 and Sun 13 December',
      price: priceOf('GARBA_WORKSHOP', 2000),
      status: workshopStatus,
    },
    {
      label: 'Dandiya sticks',
      note: 'Per pair',
      price: priceOf('DANDIYA_PAIR', 500),
      status: soldOut('DANDIYA_PAIR'),
    },
  ];

  const facts = [
    { label: 'When', value: '5 evenings, 5:00–10:30 pm' },
    { label: 'Where', value: `${EVENT_METADATA.venue.replace(', Texas', '')}, TX` },
    { label: 'Tickets from', value: `${priceOf('DAY_PASS_CHILD', 800)} an evening` },
  ];

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-container border border-gold/40 bg-glass ${
        expanded ? '' : 'h-[640px] sm:h-[580px]'
      }`}
    >
      {/* Sacred Mandala + Om SVG Backdrop extracted from design sheet, tinted strictly with brand gold */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 -top-24 flex items-center justify-center select-none text-primary"
      >
        <div className="absolute h-80 w-80 rounded-full bg-primary/15 blur-[95px]" />
        <svg
          viewBox="0 0 500 500"
          className="relative h-[460px] w-[460px] max-w-none text-current sm:h-[560px] sm:w-[560px]"
          fill="none"
        >
          <circle
            cx="250"
            cy="250"
            r="230"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            opacity="0.2"
          />
          <circle cx="250" cy="250" r="205" stroke="currentColor" strokeWidth="1" opacity="0.14" />
          <circle
            cx="250"
            cy="250"
            r="160"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 8"
            opacity="0.18"
          />
          <circle cx="250" cy="250" r="125" stroke="currentColor" strokeWidth="1" opacity="0.14" />
          <circle
            cx="250"
            cy="250"
            r="85"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 5"
            opacity="0.2"
          />
          <g stroke="currentColor" strokeWidth="1" opacity="0.15">
            <line x1="250" y1="20" x2="250" y2="75" />
            <line x1="250" y1="425" x2="250" y2="480" />
            <line x1="20" y1="250" x2="75" y2="250" />
            <line x1="425" y1="250" x2="480" y2="250" />
            <line x1="87" y1="87" x2="127" y2="127" />
            <line x1="373" y1="373" x2="413" y2="413" />
            <line x1="87" y1="413" x2="127" y2="373" />
            <line x1="373" y1="127" x2="413" y2="87" />
          </g>
          <text
            x="250"
            y="325"
            textAnchor="middle"
            fontFamily="var(--font-serif)"
            fontSize="210"
            fontWeight="bold"
            fill="currentColor"
            opacity="0.14"
          >
            🕉
          </text>
        </svg>
      </div>

      <div
        id="hero-details"
        ref={contentRef}
        className={`relative min-h-0 flex-1 px-6 pt-10 sm:px-12 sm:pt-14 ${
          expanded ? 'pb-10' : 'overflow-hidden'
        }`}
      >
        <p className="text-sm font-medium tracking-wide text-bright-gold">
          Thursday 10 – Monday 14 December 2026
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-cream sm:text-7xl">
          Sharad Utsav
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
          Five evenings of raas-garba, devotional music and shared dinners under the autumn moon,
          at Radha Krishna Temple in Allen.
        </p>

        <dl className="mt-8 grid max-w-3xl gap-px overflow-hidden rounded-card border border-gold bg-gold/30 shadow-sm sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="bg-cream px-4 py-3.5">
              <dt className="text-xs font-medium text-primary-text">{fact.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-heading">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 grid gap-10 md:grid-cols-[1.3fr_1fr] md:gap-14">
          <section aria-labelledby="hero-programme">
            <h2 id="hero-programme" className="font-serif text-2xl text-cream">
              Programme
            </h2>
            <ol className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {FESTIVAL_DAYS.map((day) => {
                const [weekday, dayNum] = day.shortLabel.split(' ');
                return (
                  <li key={day.date} className="grid grid-cols-[4.5rem_1fr] gap-4 py-3">
                    <span className="font-serif text-lg leading-snug text-primary">
                      {weekday} {dayNum}
                    </span>
                    <span className="text-sm leading-relaxed text-white/80">{day.highlight}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="hero-tickets">
            <h2 id="hero-tickets" className="font-serif text-2xl text-cream">
              Tickets
            </h2>
            <div className="mt-4">
              <PriceList rows={ticketRows} />
            </div>
            <h3 className="mt-8 text-sm font-medium text-white/90">Add-ons</h3>
            <div className="mt-2">
              <PriceList rows={extraRows} />
            </div>
          </section>
        </div>

        <p className="mt-10 max-w-2xl text-sm leading-relaxed text-white/60">
          Ages are counted on 10 December. Bookings must be made by someone aged 18 or over, and
          everyone under 18 needs a parent or guardian’s name and phone number on their pass.
        </p>

        {!expanded && isOverflowing && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-primary-dark via-primary-dark/90 to-transparent"
          />
        )}
      </div>

      <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-primary-dark/95 px-6 py-4 sm:px-12">
        <Button size="lg" onClick={() => navigate('/book')}>
          Book now
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>

        {(isOverflowing || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="hero-details"
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-bright-gold transition-colors hover:text-cream"
          >
            {expanded ? 'Show less' : 'Show full details'}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </div>
  );
}
