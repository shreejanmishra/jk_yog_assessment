import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { BookingDetailResponseDTO, IssuedPassDTO } from '@contract/index';
import { EVENT_METADATA } from '@domain/index';

export async function generateBoardingPassesPdf(
  booking: BookingDetailResponseDTO,
  passes: readonly IssuedPassDTO[],
): Promise<Buffer> {
  const qrBuffers = await Promise.all(
    passes.map((pass) =>
      QRCode.toBuffer(
        JSON.stringify({
          ref: booking.reference,
          pass: pass.passCode,
          holder: pass.fullName,
        }),
        { width: 130, margin: 1, color: { dark: '#291900', light: '#FDF3E4' } },
      ),
    ),
  );

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [680, 290],
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: `Sharad Utsav 2026 Boarding Passes - ${booking.reference}`,
        Author: EVENT_METADATA.venue,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    passes.forEach((pass, idx) => {
      doc.addPage({ size: [680, 290], margin: 0 });

      // Dark outer frame
      doc.rect(0, 0, 680, 290).fill('#2C2C2C');

      // Cream boarding-pass body
      doc.roundedRect(16, 16, 648, 258, 12).fillAndStroke('#FDF3E4', '#BC9226');

      // Top dark-gold header ribbon across boarding pass
      doc.save();
      doc.roundedRect(16, 16, 648, 56, 12).clip();
      doc.rect(16, 16, 648, 56).fill('#291900');
      doc.restore();
      doc.moveTo(16, 72).lineTo(664, 72).lineWidth(2).strokeColor('#C99B24').stroke();

      // Header text (main ticket + right stub)
      doc
        .fillColor('#D1AC3E')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('RADHA KRISHNA TEMPLE · ALLEN, TX', 32, 27, { width: 420 });
      doc
        .fillColor('#FDF3E4')
        .font('Times-Bold')
        .fontSize(20)
        .text('SHARAD UTSAV 2026 · FESTIVAL BOARDING PASS', 32, 41, { width: 430 });

      doc
        .fillColor('#D1AC3E')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('BOARDING STUB', 492, 28, { width: 156, align: 'center' });
      doc
        .fillColor('#FDF3E4')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(booking.reference, 492, 44, { width: 156, align: 'center' });

      // Semicircular punch cutouts + vertical dashed tear-off line at x = 476
      doc.circle(476, 16, 10).fill('#2C2C2C');
      doc.circle(476, 274, 10).fill('#2C2C2C');
      doc
        .save()
        .dash(5, { space: 4 })
        .moveTo(476, 30)
        .lineTo(476, 260)
        .lineWidth(1.2)
        .strokeColor('#BC9226')
        .stroke()
        .restore();

      // Main ticket fields (left side: x = 32..458)
      doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('PASSHOLDER', 32, 84);
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(pass.fullName, 32, 95, { width: 250, ellipsis: true });

      doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('PASS CATEGORY', 295, 84);
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`${pass.passLabel} (Age ${pass.age})`, 295, 97, { width: 165, ellipsis: true });

      doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('VALIDITY DATES', 32, 126);
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text(pass.validDatesDisplay, 32, 138, { width: 426 });

      doc
        .fillColor('#645743')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('EXTRAS AVAILED BY PASSHOLDER', 32, 162);
      doc
        .fillColor('#291900')
        .font('Helvetica')
        .fontSize(10)
        .text(pass.extrasSummary.join('  •  '), 32, 174, { width: 426, ellipsis: true });

      // Guardian block (mandatory on all minor <18 passes) vs Venue block
      if (pass.guardianName && pass.guardianPhone) {
        doc
          .roundedRect(32, 198, 426, 42, 6)
          .fillAndStroke('#F6E5C4', '#C99B24');
        doc
          .fillColor('#291900')
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text('MINOR SAFEGUARD · REGISTERED GUARDIAN', 42, 205);
        doc
          .fillColor('#291900')
          .font('Helvetica-Bold')
          .fontSize(11)
          .text(`${pass.guardianName}   ·   Tel: ${pass.guardianPhone}`, 42, 219, {
            width: 404,
            ellipsis: true,
          });

        doc
          .fillColor('#645743')
          .font('Helvetica')
          .fontSize(8)
          .text(`Venue: ${EVENT_METADATA.venue}, ${EVENT_METADATA.address}`, 32, 248);
      } else {
        doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('VENUE & GATE INFO', 32, 206);
        doc
          .fillColor('#291900')
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(`${EVENT_METADATA.venue} — ${EVENT_METADATA.address}`, 32, 218, { width: 426 });
        doc
          .fillColor('#645743')
          .font('Helvetica')
          .fontSize(8.5)
          .text('Gates open 5:00 PM CST daily · Present this pass & photo ID at check-in.', 32, 238);
      }

      // Right tear-off stub: QR + pass code + attendee index
      const qrBuf = qrBuffers[idx];
      if (qrBuf) {
        doc.image(qrBuf, 513, 84, { width: 114, height: 114 });
      }
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(pass.passCode, 492, 206, { width: 156, align: 'center' });
      doc
        .fillColor('#645743')
        .font('Helvetica')
        .fontSize(8.5)
        .text(`Pass ${idx + 1} of ${passes.length}`, 492, 224, { width: 156, align: 'center' });
      doc
        .fillColor('#1E7A29')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('PAID · CONFIRMED', 492, 242, { width: 156, align: 'center' });
    });

    doc.end();
  });
}
