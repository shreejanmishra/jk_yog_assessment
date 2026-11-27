import React from 'react';
import { Download, Plane, QrCode, ShieldCheck } from 'lucide-react';
import type { IssuedPassDTO } from '@contract/index';
import { EVENT_METADATA } from '@domain/index';
import { getPassesPdfUrl } from '../../../api/endpoints';
import { Button } from '../../../ui/Button';

export interface BoardingPassTicketProps {
  bookingId: string;
  reference: string;
  pass: IssuedPassDTO;
  showSingleDownloadButton?: boolean;
}

export function BoardingPassTicket({
  bookingId,
  reference,
  pass,
  showSingleDownloadButton = true,
}: BoardingPassTicketProps): React.ReactElement {
  const hasGuardian = Boolean(pass.guardianName && pass.guardianPhone);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border-2 border-[#BC9226] bg-[#FDF3E4] text-[#291900] shadow-xl">
        {/* Top airline-style dark & gold header ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#291900] px-5 py-3.5 text-[#FDF3E4] border-b-2 border-[#C99B24]">
          <div className="flex items-center gap-2.5">
            <Plane className="h-5 w-5 text-[#D1AC3E] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#D1AC3E] font-semibold">
                {EVENT_METADATA.venue}
              </p>
              <h3 className="font-display text-base sm:text-lg font-bold leading-tight">
                {EVENT_METADATA.name} · Festival Boarding Pass
              </h3>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-[#D1AC3E] block">
              Booking Ref
            </span>
            <span className="font-mono text-sm font-bold text-[#FDF3E4]">{reference}</span>
          </div>
        </div>

        {/* Main ticket body + perforated right stub */}
        <div className="grid grid-cols-1 md:grid-cols-12 relative">
          {/* Left main passenger details (8 cols) */}
          <div className="md:col-span-8 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-[#645743]">
                  Passholder Name
                </span>
                <span className="font-display text-xl font-bold text-[#291900] wrap-break-word">
                  {pass.fullName}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-[#645743]">
                  Pass Category & Age
                </span>
                <span className="text-sm font-bold text-[#291900]">
                  {pass.passLabel} · Age {pass.age}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#645743]">
                Validity of Pass
              </span>
              <span className="text-sm font-semibold text-[#291900]">
                {pass.validDatesDisplay}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#645743]">
                Extras Availed by Passholder
              </span>
              <span className="text-sm text-[#291900]">
                {pass.extrasSummary.join('  •  ')}
              </span>
            </div>

            {hasGuardian && (
              <div className="rounded-xl border border-[#C99B24] bg-[#F5E4C3] px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#291900]">
                  <ShieldCheck className="h-4 w-4 text-[#1E7A29]" aria-hidden="true" />
                  <span>Registered Guardian (Minor Safeguard)</span>
                </div>
                <p className="mt-1 text-sm font-bold text-[#291900]">
                  {pass.guardianName} <span className="font-normal text-[#645743]">·</span>{' '}
                  {pass.guardianPhone}
                </p>
              </div>
            )}

            <div className="pt-1 border-t border-[#BC9226]/30 flex flex-wrap items-center justify-between gap-2 text-xs text-[#645743]">
              <span>Venue: {EVENT_METADATA.venue}, Allen, TX</span>
              <span>Gates open 5:00 PM CST</span>
            </div>
          </div>

          {/* Perforated tear-off boarding stub (4 cols) */}
          <div className="md:col-span-4 relative border-t-2 md:border-t-0 md:border-l-2 border-dashed border-[#BC9226] bg-[#F9EBD2] p-5 flex flex-col items-center justify-center text-center">
            {/* Decorative semicircular punch notches on desktop */}
            <span
              aria-hidden="true"
              className="hidden md:block absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[#2C2C2C] border border-[#BC9226]"
            />
            <span
              aria-hidden="true"
              className="hidden md:block absolute -left-3 -bottom-3 h-6 w-6 rounded-full bg-[#2C2C2C] border border-[#BC9226]"
            />

            <span className="text-[10px] font-bold uppercase tracking-widest text-[#645743] mb-2">
              Gate Check-In Stub
            </span>

            {pass.qrDataUrl ? (
              <img
                src={pass.qrDataUrl}
                alt={`Check-in QR code for ${pass.fullName}`}
                className="h-28 w-28 rounded-lg border border-[#BC9226]/60 bg-[#FDF3E4] p-1"
              />
            ) : (
              <div className="h-28 w-28 rounded-lg border border-[#BC9226]/60 flex items-center justify-center">
                <QrCode className="h-12 w-12 text-[#291900]" />
              </div>
            )}

            <span className="mt-2 font-mono text-xs font-bold text-[#291900]">
              {pass.passCode}
            </span>
            <span className="mt-1 inline-block rounded-full bg-[#1E7A29]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#1E7A29]">
              CONFIRMED · PAID
            </span>
          </div>
        </div>
      </div>

      {showSingleDownloadButton && (
        <div className="flex justify-end">
          <a
            href={getPassesPdfUrl(bookingId, pass.attendeeId)}
            download
            className="inline-block"
          >
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Download {pass.fullName.split(' ')[0]}’s Pass (PDF)
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
