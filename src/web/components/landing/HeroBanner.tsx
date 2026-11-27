import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react';
import { cents, EVENT_METADATA, FESTIVAL_DAYS, formatUSD } from '@domain/index';
import { useCatalogStore } from '../../stores/catalog-store';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';

/**
 * Fixed-height Hero Banner:
 * - Collapsed state has a strict fixed height (`h-[540px] sm:h-[580px]`).
 * - When content exceeds the fixed height, the upper details viewport truncates cleanly
 *   with a fade mask and reveals a dropdown toggle ("Show full festival details") to expand.
 * - The "Book Now" CTA button lives in a `shrink-0` footer bar OUTSIDE the truncated box,
 *   guaranteeing the CTA is NEVER truncated regardless of content length or viewport size.
 */
export function HeroBanner(): React.ReactElement {
  const navigate = useNavigate();
  const { catalog } = useCatalogStore();
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(true);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;

    const measure = (): void => {
      setIsOverflowing(el.scrollHeight > el.clientHeight + 8);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, catalog]);

  const workshop = catalog?.products.find((p) => p.code === 'GARBA_WORKSHOP');
  const adultAllDay = catalog?.products.find((p) => p.code === 'ALL_DAY_ADULT');

  return (
    <div
      className={`relative flex flex-col rounded-3xl border border-[#BC9226]/70 bg-gradient-to-br from-[#352b18] via-[#2C2C2C] to-[#232323] p-5 sm:p-8 shadow-2xl transition-all duration-300 ${
        expanded ? 'h-auto' : 'h-[540px] sm:h-[580px]'
      }`}
    >
      {/* Upper Festival Details Region (truncates cleanly when collapsed) */}
      <div
        ref={contentRef}
        className={`relative min-h-0 flex-1 ${expanded ? 'overflow-visible' : 'overflow-hidden'}`}
      >
        <div className="space-y-5 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">
              <Sparkles className="h-3.5 w-3.5" /> Annual 5-Day Cultural & Bhakti Festival
            </Badge>
            {adultAllDay?.availability.status === 'sold_out' && (
              <Badge variant="sold-out">Adult All-Day Pass: Sold Out</Badge>
            )}
            {workshop && workshop.availability.remaining > 0 && workshop.availability.remaining <= 5 && (
              <Badge variant="low-stock">
                Garba Workshop: Only {workshop.availability.remaining} spots left!
              </Badge>
            )}
          </div>

          <div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#FDF3E4]">
              {EVENT_METADATA.name}
            </h1>
            <p className="mt-2 text-base sm:text-lg text-white/85 max-w-3xl leading-relaxed">
              Five luminous evenings of traditional Raas-Garba, live devotional music, guided
              choreography workshops, family cultural programs, and sattvic temple dining under
              autumn skies.
            </p>
          </div>

          {/* Key Event Facts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D1AC3E]">
                <CalendarDays className="h-4 w-4" /> Festival Dates
              </div>
              <p className="mt-1 text-sm font-semibold text-white">
                Thu 10 Dec → Mon 14 Dec 2026
              </p>
              <p className="text-xs text-white/65">5 Evenings · 5:00 PM – 10:30 PM CST</p>
            </div>

            <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D1AC3E]">
                <MapPin className="h-4 w-4" /> Temple Venue
              </div>
              <p className="mt-1 text-sm font-semibold text-white">{EVENT_METADATA.venue}</p>
              <p className="text-xs text-white/65">{EVENT_METADATA.address}</p>
            </div>

            <div className="rounded-xl border border-white/15 bg-white/[0.05] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D1AC3E]">
                <Users className="h-4 w-4" /> Family-Friendly Passes
              </div>
              <p className="mt-1 text-sm font-semibold text-white">
                Adults {formatUSD(cents(1500))}/day · Kids {formatUSD(cents(800))}/day
              </p>
              <p className="text-xs text-white/65">
                Toddlers under 5 enter Free · Family Pass {formatUSD(cents(4000))}
              </p>
            </div>
          </div>

          {/* Detailed 5-Day Schedule & Add-Ons (revealed in full via dropdown when truncated) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4 space-y-2.5">
              <h2 className="font-display text-lg font-semibold text-[#FDF3E4]">
                5-Day Evening Program Highlights
              </h2>
              <ul className="space-y-2 text-xs sm:text-sm text-white/80">
                {FESTIVAL_DAYS.map((day) => (
                  <li key={day.date} className="flex items-start gap-2">
                    <span className="font-semibold text-[#D1AC3E] shrink-0 w-22">
                      {day.shortLabel}:
                    </span>
                    <span>{day.highlight}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4 space-y-2.5">
              <h2 className="font-display text-lg font-semibold text-[#FDF3E4]">
                Passes, Extras & Age Guidelines
              </h2>
              <ul className="space-y-1.5 text-xs sm:text-sm text-white/80">
                <li>
                  • <strong>Ages 12+:</strong> Adult Day Pass ($15/day) or Family Pass. Bookers must
                  be 18+.
                </li>
                <li>
                  • <strong>Ages 5–11:</strong> Child Day Pass ($8/day) or Child All-Day Pass ($30
                  flat).
                </li>
                <li>
                  • <strong>Under 5:</strong> Free entry pass (no ticket charge; registered for gate
                  check-in).
                </li>
                <li>
                  • <strong>Minor Safety:</strong> Guardian Name & Phone required for all attendees
                  under 18 and printed on their boarding pass.
                </li>
                <li>
                  • <strong>Festival Extras:</strong> Sattvic Dinner Plate ($12/person/day), Dandiya
                  Sticks ($5/pair), and Master Garba Workshop ($20 — Fri 11 Dec & Sun 13 Dec only).
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade mask when truncated */}
        {!expanded && isOverflowing && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#282623] via-[#282623]/90 to-transparent"
          />
        )}
      </div>

      {/* Pinned CTA & Truncation Dropdown Footer — NEVER truncated */}
      <div className="shrink-0 pt-4 mt-2 border-t border-[#BC9226]/35 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={() => navigate('/book')}>
            <span>Book Now</span>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <span className="hidden md:inline text-xs text-white/65">
            Instant boarding pass PDF & confirmation
          </span>
        </div>

        {(isOverflowing || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#BC9226]/70 bg-white/[0.06] px-4 py-2 text-xs sm:text-sm font-medium text-[#D1AC3E] hover:bg-[#C99B24]/15 transition-colors cursor-pointer"
          >
            <span>{expanded ? 'Show less details' : 'Show full banner details'}</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
