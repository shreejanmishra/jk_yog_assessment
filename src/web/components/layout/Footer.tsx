import React from 'react';
import { EVENT_METADATA } from '@domain/index';

export function Footer(): React.ReactElement {
  return (
    <footer className="mt-24 border-t border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-serif text-lg text-white">
            Sharad Utsav <span className="text-primary">2026</span>
          </p>
          <p className="mt-2 leading-relaxed text-white/60">
            {EVENT_METADATA.venue}
            <br />
            {EVENT_METADATA.address}
          </p>
        </div>
        <div>
          <p className="font-medium text-white">Festival</p>
          <p className="mt-2 leading-relaxed text-white/60">
            Thursday 10 – Monday 14 December 2026
            <br />
            Gates open at 5:00 pm each evening
          </p>
        </div>
        <div>
          <p className="font-medium text-white">Questions</p>
          <p className="mt-2 leading-relaxed text-white/60">
            Visit the temple office, or ask any volunteer at the main gate during the festival.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-white/45 sm:px-6">
          © 2026 Radha Krishna Temple, Allen, Texas. All prices in US dollars.
        </p>
      </div>
    </footer>
  );
}
