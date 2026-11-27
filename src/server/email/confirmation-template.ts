import type { IssuedPassDTO, QuoteLineDTO } from '@contract/index';
import { cents, EVENT_METADATA, formatUSD } from '@domain/index';
import type { StoredEmailAttachment } from '../db/schema';

export const SIMULATED_FROM_EMAIL = 'Sharad Utsav Desk <bookings@sharadutsav.radhakrishnatemple.org>';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ConfirmationEmailInput {
  readonly bookingId: string;
  readonly reference: string;
  readonly bookerName: string;
  readonly bookerEmail: string;
  readonly invoiceNumber: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly promoCode: string | null;
  readonly passes: readonly IssuedPassDTO[];
  readonly lines: readonly QuoteLineDTO[];
}

export interface RenderedConfirmationEmail {
  readonly toEmail: string;
  readonly fromEmail: string;
  readonly subject: string;
  readonly htmlBody: string;
  readonly textBody: string;
  readonly attachments: StoredEmailAttachment[];
}

export function renderConfirmationEmail(
  input: ConfirmationEmailInput,
): RenderedConfirmationEmail {
  const subject = `Booking Confirmed · ${EVENT_METADATA.name} (${input.reference})`;
  const passesUrl = `/api/bookings/${input.bookingId}/passes.pdf`;
  const invoiceUrl = `/api/bookings/${input.bookingId}/invoice.pdf`;

  const passCardsHtml = input.passes
    .map((p) => {
      const guardianRow =
        p.guardianName && p.guardianPhone
          ? `<div style="margin-top:8px;padding:8px 10px;background:#F5E6C8;border-left:3px solid #BC9226;border-radius:4px;font-size:13px;color:#291900;">
               <strong>Guardian (Minor Safeguard):</strong> ${escapeHtml(p.guardianName)} · ${escapeHtml(p.guardianPhone)}
             </div>`
          : '';
      return `
        <div style="background:#FDF3E4;border:1px solid #BC9226;border-radius:10px;padding:14px 16px;margin-bottom:12px;color:#291900;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px dashed #BC9226;padding-bottom:8px;margin-bottom:8px;">
            <strong style="font-size:16px;">${escapeHtml(p.fullName)}</strong>
            <span style="font-size:12px;background:#2C2C2C;color:#FDF3E4;padding:2px 8px;border-radius:999px;">${escapeHtml(p.passCode)}</span>
          </div>
          <div style="font-size:13px;color:#645743;line-height:1.5;">
            <div><strong style="color:#291900;">Pass:</strong> ${escapeHtml(p.passLabel)} (Age ${p.age})</div>
            <div><strong style="color:#291900;">Valid Dates:</strong> ${escapeHtml(p.validDatesDisplay)}</div>
            <div><strong style="color:#291900;">Extras:</strong> ${escapeHtml(p.extrasSummary.join(' · '))}</div>
          </div>
          ${guardianRow}
        </div>
      `;
    })
    .join('');

  const lineRowsHtml = input.lines
    .map(
      (line) => `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#645743;">${escapeHtml(line.label)}</td>
        <td style="padding:6px 0;font-size:13px;color:#291900;text-align:right;font-weight:600;">${formatUSD(cents(line.lineTotalCents))}</td>
      </tr>`,
    )
    .join('');

  const discountRowHtml =
    input.discountCents > 0
      ? `<tr>
           <td style="padding:6px 0;font-size:13px;color:#1E7A29;">Promo Discount (${escapeHtml(input.promoCode ?? 'APPLIED')})</td>
           <td style="padding:6px 0;font-size:13px;color:#1E7A29;text-align:right;font-weight:600;">-${formatUSD(cents(input.discountCents))}</td>
         </tr>`
      : '';

  const htmlBody = `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#2C2C2C;color:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #BC9226;">
      <div style="background:#291900;padding:24px;border-bottom:2px solid #C99B24;">
        <div style="color:#D1AC3E;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(EVENT_METADATA.venue)}</div>
        <h1 style="margin:6px 0 4px;font-family:Georgia,serif;font-size:26px;color:#FDF3E4;">${escapeHtml(EVENT_METADATA.name)}</h1>
        <div style="font-size:14px;color:#FDF3E4;">Thu 10 Dec 2026 – Mon 14 Dec 2026 · Booking Reference: <strong style="color:#D1AC3E;">${escapeHtml(input.reference)}</strong></div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
          Namaste <strong>${escapeHtml(input.bookerName)}</strong>, your festival passes are confirmed! Your boarding-pass style tickets and itemized invoice (${escapeHtml(input.invoiceNumber)}) are attached below.
        </p>
        <h2 style="font-family:Georgia,serif;font-size:18px;color:#D1AC3E;margin:20px 0 10px;">Issued Boarding Passes (${input.passes.length})</h2>
        ${passCardsHtml}
        <div style="background:#FDF3E4;border-radius:10px;padding:16px;margin-top:18px;color:#291900;">
          <div style="font-weight:700;font-size:15px;margin-bottom:8px;">Payment Summary · Invoice ${escapeHtml(input.invoiceNumber)}</div>
          <table style="width:100%;border-collapse:collapse;">
            ${lineRowsHtml}
            <tr style="border-top:1px solid #DEC8A4;">
              <td style="padding:8px 0 4px;font-size:13px;color:#645743;">Subtotal</td>
              <td style="padding:8px 0 4px;font-size:13px;text-align:right;">${formatUSD(cents(input.subtotalCents))}</td>
            </tr>
            ${discountRowHtml}
            <tr style="border-top:2px solid #291900;">
              <td style="padding:8px 0 0;font-size:15px;font-weight:700;">Total Paid</td>
              <td style="padding:8px 0 0;font-size:15px;font-weight:700;text-align:right;">${formatUSD(cents(input.totalCents))}</td>
            </tr>
          </table>
        </div>
        <p style="margin:18px 0 0;font-size:12px;color:#CCCCCC;">
          Venue: ${escapeHtml(EVENT_METADATA.venue)}, ${escapeHtml(EVENT_METADATA.address)} · Present QR code at the temple gate.
        </p>
      </div>
    </div>
  `.trim();

  const textPasses = input.passes
    .map((p) => {
      const g =
        p.guardianName && p.guardianPhone
          ? ` | Guardian: ${p.guardianName} (${p.guardianPhone})`
          : '';
      return `- ${p.fullName} [${p.passCode}]: ${p.passLabel} | Valid: ${p.validDatesDisplay} | Extras: ${p.extrasSummary.join(', ')}${g}`;
    })
    .join('\n');

  const textBody = [
    `${EVENT_METADATA.name} — Booking Confirmed (${input.reference})`,
    `Venue: ${EVENT_METADATA.venue}, ${EVENT_METADATA.address}`,
    `Invoice: ${input.invoiceNumber}`,
    '',
    'Passes:',
    textPasses,
    '',
    `Subtotal: ${formatUSD(cents(input.subtotalCents))}`,
    `Discount: -${formatUSD(cents(input.discountCents))}`,
    `Total Paid: ${formatUSD(cents(input.totalCents))}`,
  ].join('\n');

  return {
    toEmail: input.bookerEmail,
    fromEmail: SIMULATED_FROM_EMAIL,
    subject,
    htmlBody,
    textBody,
    attachments: [
      {
        filename: `Sharad-Utsav-Passes-${input.reference}.pdf`,
        url: passesUrl,
        contentType: 'application/pdf',
      },
      {
        filename: `Invoice-${input.invoiceNumber}.pdf`,
        url: invoiceUrl,
        contentType: 'application/pdf',
      },
    ],
  };
}
