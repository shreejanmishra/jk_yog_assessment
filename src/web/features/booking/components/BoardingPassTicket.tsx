import React from "react";
import { Download, Plane, QrCode } from "lucide-react";
import type { IssuedPassDTO } from "@contract/index";
import { EVENT_METADATA } from "@domain/index";
import { getPassesPdfUrl } from "../../../api/endpoints";
import { Button } from "../../../ui/Button";

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
      <div className="relative overflow-hidden rounded-card border border-gold bg-cream text-heading">
        {/* Airline-style boarding pass header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary bg-heading px-5 py-3.5 text-cream sm:px-6">
          <div className="flex items-center gap-3">
            <Plane
              className="h-4 w-4 shrink-0 text-bright-gold"
              aria-hidden="true"
            />
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-bright-gold">
                {EVENT_METADATA.venue}
              </p>
              <h3 className="font-serif text-base text-cream sm:text-lg">
                {EVENT_METADATA.name}
              </h3>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="block text-[10px] uppercase tracking-wider text-cream/60">
              Booking ref
            </span>
            <span className="tabular font-mono text-sm font-semibold text-cream">
              {reference}
            </span>
          </div>
        </div>

        {/* Main passenger coupon + perforated gate stub */}
        <div className="relative grid grid-cols-1 md:grid-cols-12">
          <div className="space-y-4 p-5 sm:p-6 md:col-span-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-primary-text">
                  Passholder
                </span>
                <span className="mt-0.5 block font-serif text-2xl leading-tight text-heading wrap-break-word">
                  {pass.fullName}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-primary-text">
                  Pass &amp; age
                </span>
                <span className="mt-1 block text-sm font-semibold text-heading">
                  {pass.passLabel} · Age {pass.age}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-heading/10 pt-3.5 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-primary-text">
                  Valid evenings
                </span>
                <span className="mt-0.5 block text-sm font-medium text-heading">
                  {pass.validDatesDisplay}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-primary-text">
                  Add-ons
                </span>
                <span className="mt-0.5 block text-sm text-heading">
                  {pass.extrasSummary.join(" · ")}
                </span>
              </div>
            </div>

            {hasGuardian && (
              <div className="rounded-control border border-gold/70 px-3.5 py-2.5">
                <span className="block text-[11px] uppercase tracking-wider text-primary-text">
                  Parent / guardian on file
                </span>
                <p className="mt-0.5 text-sm font-semibold text-heading">
                  {pass.guardianName}{" "}
                  <span className="font-normal text-primary-text">·</span>{" "}
                  {pass.guardianPhone}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-heading/10 pt-3 text-xs text-primary-text">
              <span>{EVENT_METADATA.address}</span>
              <span>Gates open 5:00 pm CST</span>
            </div>
          </div>

          {/* Perforated tear-off stub */}
          <div className="relative flex flex-col items-center justify-center border-t border-dashed border-gold/80 p-5 text-center md:col-span-4 md:border-t-0 md:border-l">
            <span
              aria-hidden="true"
              className="absolute -left-2.5 -top-2.5 hidden h-5 w-5 rounded-full border border-gold bg-primary-dark md:block"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-2.5 -left-2.5 hidden h-5 w-5 rounded-full border border-gold bg-primary-dark md:block"
            />

            <span className="mb-2 text-[10px] uppercase tracking-widest text-primary-text">
              Gate check-in
            </span>

            {pass.qrDataUrl ? (
              <img
                src={pass.qrDataUrl}
                alt={`Check-in QR code for ${pass.fullName}`}
                className="h-28 w-28 rounded-sm border border-heading/15 bg-white p-1.5"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-sm border border-heading/15 bg-white">
                <QrCode className="h-12 w-12 text-heading" aria-hidden="true" />
              </div>
            )}

            <span className="tabular mt-2.5 font-mono text-xs font-semibold text-heading">
              {pass.passCode}
            </span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-success-on-light">
              Confirmed
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
              <Download className="h-4 w-4" aria-hidden="true" />
              Download {pass.fullName.split(" ")[0]}’s pass (PDF)
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
