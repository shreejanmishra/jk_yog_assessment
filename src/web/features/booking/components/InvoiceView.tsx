import React from 'react';
import { Download } from 'lucide-react';
import type { BookingDetailResponseDTO } from '@contract/index';
import { cents, formatUSD } from '@domain/index';
import { getInvoicePdfUrl } from '../../../api/endpoints';
import { Button } from '../../../ui/Button';

export interface InvoiceViewProps {
  booking: BookingDetailResponseDTO;
}

export function InvoiceView({ booking }: InvoiceViewProps): React.ReactElement {
  const invoice = booking.invoice;
  if (!invoice) {
    return (
      <p className="text-sm text-white/65">
        An invoice is generated once payment is confirmed.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-gold/60 bg-cream p-6 text-heading sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-heading/15 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-text">
              Receipt &amp; tax invoice
            </p>
            <h3 className="mt-1 font-serif text-2xl text-heading">{invoice.sellerName}</h3>
            <p className="mt-1 text-xs text-primary-text">{invoice.sellerAddress}</p>
            <p className="text-xs text-primary-text">EIN {invoice.sellerEin}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="tabular font-mono text-sm font-semibold text-heading">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-0.5 text-xs text-primary-text">Ref {booking.reference}</p>
            <p className="text-xs text-primary-text">
              Issued {new Date(invoice.issuedAt).toLocaleDateString('en-US')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-heading/15 py-4 text-sm sm:grid-cols-2">
          <div>
            <span className="block text-[11px] uppercase tracking-wider text-primary-text">
              Billed to
            </span>
            <p className="mt-0.5 font-semibold">{invoice.billedToName}</p>
            <p className="text-primary-text">{invoice.billedToEmail}</p>
            <p className="text-primary-text">{invoice.billedToPhone}</p>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wider text-primary-text">
              Payment
            </span>
            <p className="mt-0.5 font-medium">{invoice.paymentMethodLabel}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-success-on-light">
              Paid in full
            </p>
          </div>
        </div>

        <div className="py-4">
          <div className="grid grid-cols-12 border-b border-heading/15 pb-2 text-[11px] uppercase tracking-wider text-primary-text">
            <span className="col-span-8">Item</span>
            <span className="col-span-1 text-right">Qty</span>
            <span className="col-span-3 text-right">Amount</span>
          </div>
          <div className="divide-y divide-heading/10">
            {booking.lines.map((line, idx) => (
              <div key={`${line.productCode}-${idx}`} className="grid grid-cols-12 py-2 text-sm">
                <span className="col-span-8 pr-3">{line.label}</span>
                <span className="tabular col-span-1 text-right text-primary-text">
                  {line.quantity}
                </span>
                <span className="tabular col-span-3 text-right font-medium">
                  {formatUSD(cents(line.lineTotalCents))}
                </span>
              </div>
            ))}
          </div>
        </div>

        <dl className="space-y-1.5 border-t border-heading/15 pt-3 text-sm">
          <div className="flex justify-between text-primary-text">
            <dt>Subtotal</dt>
            <dd className="tabular">{formatUSD(cents(invoice.subtotalCents))}</dd>
          </div>
          {invoice.discountCents > 0 && (
            <div className="flex justify-between text-success-on-light">
              <dt>Discount ({invoice.promoCode ?? 'Promo'})</dt>
              <dd className="tabular">-{formatUSD(cents(invoice.discountCents))}</dd>
            </div>
          )}
          <div className="flex justify-between text-primary-text">
            <dt>Nonprofit tax (0%)</dt>
            <dd className="tabular">{formatUSD(cents(invoice.taxCents))}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-heading/20 pt-2.5 font-semibold text-heading">
            <dt>Total paid (USD)</dt>
            <dd className="tabular font-serif text-xl">{formatUSD(cents(invoice.totalCents))}</dd>
          </div>
        </dl>
      </div>

      <div className="flex justify-end">
        <a href={getInvoicePdfUrl(booking.bookingId)} download>
          <Button>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download as PDF
          </Button>
        </a>
      </div>
    </div>
  );
}
