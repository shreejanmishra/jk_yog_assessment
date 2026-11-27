import PDFDocument from 'pdfkit';
import type { BookingDetailResponseDTO } from '@contract/index';
import { cents, EVENT_METADATA, formatUSD } from '@domain/index';

export function generateInvoicePdf(booking: BookingDetailResponseDTO): Promise<Buffer> {
  const invoice = booking.invoice;
  if (!invoice) {
    throw new Error('Cannot generate invoice PDF before booking confirmation.');
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 48,
      info: {
        Title: `Invoice ${invoice.invoiceNumber} - ${booking.reference}`,
        Author: EVENT_METADATA.venue,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header banner
    doc.rect(0, 0, 612, 108).fill('#291900');
    doc.moveTo(0, 108).lineTo(612, 108).lineWidth(3).strokeColor('#C99B24').stroke();

    doc
      .fillColor('#D1AC3E')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('OFFICIAL TAX-EXEMPT FESTIVAL RECEIPT & INVOICE', 48, 30);
    doc
      .fillColor('#FDF3E4')
      .font('Times-Bold')
      .fontSize(24)
      .text(EVENT_METADATA.name, 48, 46);
    doc
      .fillColor('#FDF3E4')
      .font('Helvetica')
      .fontSize(10)
      .text(`${invoice.sellerName} · ${invoice.sellerAddress}`, 48, 76);

    doc
      .fillColor('#D1AC3E')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(invoice.invoiceNumber, 380, 38, { width: 184, align: 'right' });
    doc
      .fillColor('#FDF3E4')
      .font('Helvetica')
      .fontSize(10)
      .text(`Ref: ${booking.reference}`, 380, 56, { width: 184, align: 'right' })
      .text(`Issued: ${invoice.issuedAt.slice(0, 10)}`, 380, 72, { width: 184, align: 'right' });

    // Billed To & Payment Details
    let y = 132;
    doc.fillColor('#645743').font('Helvetica-Bold').fontSize(9).text('BILLED TO', 48, y);
    doc.fillColor('#645743').font('Helvetica-Bold').fontSize(9).text('PAYMENT DETAILS', 330, y);

    y += 14;
    doc
      .fillColor('#291900')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(invoice.billedToName, 48, y);
    doc
      .fillColor('#645743')
      .font('Helvetica')
      .fontSize(10)
      .text(invoice.billedToEmail, 48, y + 15)
      .text(invoice.billedToPhone, 48, y + 30);

    doc
      .fillColor('#291900')
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(invoice.paymentMethodLabel, 330, y);
    doc
      .fillColor('#1E7A29')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Status: PAID (Simulated Gateway)', 330, y + 15);
    doc
      .fillColor('#645743')
      .font('Helvetica')
      .fontSize(9.5)
      .text(`Nonprofit EIN: ${invoice.sellerEin}`, 330, y + 30);

    // Line items table
    y = 212;
    doc.rect(48, y, 516, 24).fill('#FDF3E4');
    doc.fillColor('#291900').font('Helvetica-Bold').fontSize(9.5);
    doc.text('DESCRIPTION', 58, y + 7, { width: 300 });
    doc.text('QTY', 365, y + 7, { width: 45, align: 'right' });
    doc.text('UNIT', 420, y + 7, { width: 65, align: 'right' });
    doc.text('AMOUNT', 490, y + 7, { width: 64, align: 'right' });

    y += 30;
    for (const line of booking.lines) {
      if (y > 660) {
        doc.addPage();
        y = 48;
      }
      doc.fillColor('#291900').font('Helvetica').fontSize(10);
      doc.text(line.label, 58, y, { width: 300 });
      doc.text(String(line.quantity), 365, y, { width: 45, align: 'right' });
      doc.text(formatUSD(cents(line.unitPriceCents)), 420, y, { width: 65, align: 'right' });
      doc
        .font('Helvetica-Bold')
        .text(formatUSD(cents(line.lineTotalCents)), 490, y, { width: 64, align: 'right' });
      y += 22;
      doc.moveTo(48, y - 4).lineTo(564, y - 4).lineWidth(0.5).strokeColor('#E5DAC7').stroke();
    }

    // Totals block
    y += 12;
    doc.fillColor('#645743').font('Helvetica').fontSize(10);
    doc.text('Subtotal', 380, y, { width: 100, align: 'right' });
    doc
      .fillColor('#291900')
      .text(formatUSD(cents(invoice.subtotalCents)), 490, y, { width: 64, align: 'right' });

    if (invoice.discountCents > 0) {
      y += 18;
      doc
        .fillColor('#1E7A29')
        .text(`Promo (${invoice.promoCode ?? 'DISCOUNT'})`, 340, y, { width: 140, align: 'right' });
      doc.text(`-${formatUSD(cents(invoice.discountCents))}`, 490, y, {
        width: 64,
        align: 'right',
      });
    }

    y += 18;
    doc.fillColor('#645743').text('Nonprofit Sales Tax (0%)', 340, y, { width: 140, align: 'right' });
    doc
      .fillColor('#291900')
      .text(formatUSD(cents(invoice.taxCents)), 490, y, { width: 64, align: 'right' });

    y += 22;
    doc.rect(340, y - 5, 224, 28).fill('#FDF3E4');
    doc.fillColor('#291900').font('Helvetica-Bold').fontSize(12);
    doc.text('Total Paid (USD)', 350, y + 3, { width: 130, align: 'right' });
    doc.text(formatUSD(cents(invoice.totalCents)), 490, y + 3, { width: 64, align: 'right' });

    // Footer note
    doc
      .fillColor('#645743')
      .font('Helvetica')
      .fontSize(8.5)
      .text(
        'Note: Payment was processed via the Sharad Utsav 2026 simulated payment gateway for demonstration purposes.',
        48,
        720,
        { width: 516, align: 'center' },
      );

    doc.end();
  });
}
