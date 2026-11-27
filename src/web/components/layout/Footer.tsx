import React from 'react';
import { MapPin } from 'lucide-react';
import { EVENT_METADATA } from '@domain/index';

export function Footer(): React.ReactElement {
  return (
    <footer className="border-t border-white/15 bg-[#242424] py-10 mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-white/70">
        <div>
          <p className="font-display text-lg font-bold text-white">{EVENT_METADATA.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm">
            <MapPin className="h-4 w-4 text-[#D1AC3E] shrink-0" />
            <span>
              {EVENT_METADATA.venue} · {EVENT_METADATA.address}
            </span>
          </p>
        </div>
        <div className="text-xs text-white/55">
          <p>Thu 10 Dec 2026 – Mon 14 Dec 2026 · All prices in USD</p>
          <p className="mt-1">© 2026 Radha Krishna Temple of Dallas (Allen, TX)</p>
        </div>
      </div>
    </footer>
  );
}
