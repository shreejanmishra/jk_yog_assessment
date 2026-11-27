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
        Title: `Sharad Utsav 2026 Festival Passes - ${booking.reference}`,
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

      // Cream festival-pass body
      doc.roundedRect(16, 16, 648, 258, 12).fill('#FDF3E4');

      // Top dark-brown header ribbon clipped to the full card rounded rect (flush bottom corners)
      doc.save();
      doc.roundedRect(16, 16, 648, 258, 12).clip();
      doc.rect(16, 16, 648, 54).fill('#291900');
      doc.moveTo(16, 70).lineTo(664, 70).lineWidth(2).strokeColor('#C99B24').stroke();
      doc.restore();

      // Crisp gold outer border around the entire pass
      doc.roundedRect(16, 16, 648, 258, 12).lineWidth(1).strokeColor('#BC9226').stroke();

      // Header text: single clean title on left + booking ref on right stub
      doc
        .fillColor('#FDF3E4')
        .font('Times-Bold')
        .fontSize(21)
        .text('SHARAD UTSAV 2026', 32, 34, {
          width: 424,
          characterSpacing: 0.5,
          lineBreak: false,
        });

      doc
        .fillColor('#D1AC3E')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('BOOKING REF', 492, 26, {
          width: 156,
          align: 'center',
          characterSpacing: 0.8,
          lineBreak: false,
        });
      doc
        .fillColor('#FDF3E4')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(booking.reference, 492, 41, {
          width: 156,
          align: 'center',
          lineBreak: false,
        });

      // Vertical dashed perforation line + semicircular punch cutouts at x = 476
      doc
        .save()
        .dash(5, { space: 4 })
        .moveTo(476, 28)
        .lineTo(476, 262)
        .lineWidth(1.2)
        .strokeColor('#BC9226')
        .stroke()
        .restore();

      doc.save();
      doc.roundedRect(16, 16, 648, 258, 12).clip();
      doc.circle(476, 16, 10).fillAndStroke('#2C2C2C', '#BC9226');
      doc.circle(476, 274, 10).fillAndStroke('#2C2C2C', '#BC9226');
      doc.restore();
      // Clean outer edge of the notch circles so outer dark background stays seamless
      doc.rect(464, 4, 24, 12).fill('#2C2C2C');
      doc.rect(464, 274, 24, 12).fill('#2C2C2C');

      // Main ticket fields (left side: x = 32..458)
      doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('PASSHOLDER', 32, 86);
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(pass.fullName, 32, 97, { width: 250, ellipsis: true });

      doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('PASS CATEGORY', 295, 86);
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`${pass.passLabel} (Age ${pass.age})`, 295, 99, { width: 165, ellipsis: true });

      doc.fillColor('#645743').font('Helvetica-Bold').fontSize(8).text('VALIDITY DATES', 32, 127);
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text(pass.validDatesDisplay, 32, 139, { width: 426 });

      doc
        .fillColor('#645743')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('EXTRAS AVAILED BY PASSHOLDER', 32, 163);
      doc
        .fillColor('#291900')
        .font('Helvetica')
        .fontSize(10)
        .text(pass.extrasSummary.join('  •  '), 32, 175, { width: 426, ellipsis: true });

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
        doc.image(qrBuf, 513, 86, { width: 114, height: 114 });
      }
      doc
        .fillColor('#291900')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(pass.passCode, 492, 207, { width: 156, align: 'center' });
      doc
        .fillColor('#645743')
        .font('Helvetica')
        .fontSize(8.5)
        .text(`Pass ${idx + 1} of ${passes.length}`, 492, 225, { width: 156, align: 'center' });
      doc
        .fillColor('#1E7A29')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('PAID · CONFIRMED', 492, 243, { width: 156, align: 'center' });
    });

    doc.end();
  });
}
