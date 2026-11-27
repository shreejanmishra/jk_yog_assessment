import React from 'react';
import { Download, Receipt } from 'lucide-react';
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
      <p className="text-sm text-white/75">
        Invoice will be generated automatically once payment is confirmed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#BC9226] bg-[#FDF3E4] p-5 text-[#291900]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#BC9226]/40 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#645743]">
              <Receipt className="h-4 w-4 text-[#BC9226]" />
              <span>Official Festival Receipt & Invoice</span>
            </div>
            <h3 className="mt-1 font-display text-2xl font-bold">{invoice.sellerName}</h3>
            <p className="text-xs text-[#645743]">{invoice.sellerAddress}</p>
            <p className="text-xs text-[#645743]">EIN: {invoice.sellerEin}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="font-mono text-base font-bold text-[#291900]">
              {invoice.invoiceNumber}
            </p>
            <p className="text-xs text-[#645743]">Booking Ref: {booking.reference}</p>
            <p className="text-xs text-[#645743]">
              Issued: {new Date(invoice.issuedAt).toLocaleDateString('en-US')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-[#BC9226]/30 text-sm">
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-[#645743]">
              Billed To
            </span>
            <p className="font-bold">{invoice.billedToName}</p>
            <p className="text-[#645743]">{invoice.billedToEmail}</p>
            <p className="text-[#645743]">{invoice.billedToPhone}</p>
          </div>
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-[#645743]">
              Payment Method
            </span>
            <p className="font-semibold">{invoice.paymentMethodLabel}</p>
            <p className="text-xs font-bold text-[#1E7A29] mt-1">PAID IN FULL</p>
          </div>
        </div>

        <div className="py-3 space-y-2">
          <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-wider text-[#645743] pb-1 border-b border-[#BC9226]/30">
            <span className="col-span-8">Description</span>
            <span className="col-span-1 text-right">Qty</span>
            <span className="col-span-3 text-right">Amount</span>
          </div>
          {booking.lines.map((line, idx) => (
            <div
              key={`${line.productCode}-${idx}`}
              className="grid grid-cols-12 text-sm py-1 border-b border-[#BC9226]/15"
            >
              <span className="col-span-8 pr-2">{line.label}</span>
              <span className="col-span-1 text-right text-[#645743]">{line.quantity}</span>
              <span className="col-span-3 text-right font-semibold">
                {formatUSD(cents(line.lineTotalCents))}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-2 space-y-1.5 text-sm">
          <div className="flex justify-between text-[#645743]">
            <span>Subtotal</span>
            <span>{formatUSD(cents(invoice.subtotalCents))}</span>
          </div>
          {invoice.discountCents > 0 && (
            <div className="flex justify-between text-[#1E7A29] font-medium">
              <span>Promo Discount ({invoice.promoCode ?? 'APPLIED'})</span>
              <span>-{formatUSD(cents(invoice.discountCents))}</span>
            </div>
          )}
          <div className="flex justify-between text-[#645743]">
            <span>Nonprofit Tax (0%)</span>
            <span>{formatUSD(cents(invoice.taxCents))}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-[#291900] pt-2 border-t border-[#291900]/30">
            <span>Total Paid (USD)</span>
            <span>{formatUSD(cents(invoice.totalCents))}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <a href={getInvoicePdfUrl(booking.bookingId)} download>
          <Button variant="primary">
            <Download className="h-4 w-4" />
            Download Invoice as PDF
          </Button>
        </a>
      </div>
    </div>
  );
}
