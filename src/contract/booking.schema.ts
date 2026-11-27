import { z } from 'zod';
import { BookingIntentSchema, QuoteLineDTOSchema } from './quote.schema';

export const PaymentMethodSchema = z.enum(['card', 'stripe']);

export const CreateBookingRequestSchema = BookingIntentSchema.extend({
  paymentMethod: PaymentMethodSchema,
  expectedTotalCents: z.number().int().nonnegative(),
});

export const CreateBookingResponseSchema = z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['pending_payment', 'confirmed']),
  currency: z.literal('USD'),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  holdExpiresAt: z.string(),
  paymentMethod: PaymentMethodSchema,
  paymentUrl: z.string().nullable(),
});

export const SimulatePaymentRequestSchema = z.object({
  outcome: z.enum(['success', 'decline', 'cancel']),
  method: PaymentMethodSchema,
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  cardholderName: z.string().max(120).optional(),
});

export const SimulatePaymentResponseSchema = z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['pending_payment', 'confirmed', 'cancelled']),
  redirectUrl: z.string(),
  message: z.string(),
});

export const IssuedPassDTOSchema = z.object({
  attendeeId: z.string().uuid(),
  passCode: z.string(),
  fullName: z.string(),
  age: z.number().int(),
  ageBand: z.enum(['infant', 'child', 'adult']),
  selectedCategory: z.enum(['infant', 'child', 'adult']),
  passKind: z.enum(['day_pass', 'all_day', 'family_pass', 'free_infant']),
  passLabel: z.string(),
  validDates: z.array(z.string()),
  validDatesDisplay: z.string(),
  extrasSummary: z.array(z.string()),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  qrDataUrl: z.string().optional(),
});

export const InvoiceSummaryDTOSchema = z.object({
  invoiceNumber: z.string(),
  issuedAt: z.string(),
  sellerName: z.string(),
  sellerAddress: z.string(),
  sellerEin: z.string(),
  billedToName: z.string(),
  billedToEmail: z.string(),
  billedToPhone: z.string(),
  paymentMethodLabel: z.string(),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  promoCode: z.string().nullable(),
});

export const BookingDetailResponseSchema = z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  mode: z.enum(['individual', 'group']),
  status: z.enum(['pending_payment', 'confirmed', 'expired', 'cancelled']),
  event: z.object({
    name: z.string(),
    venue: z.string(),
    address: z.string(),
    datesLabel: z.string(),
  }),
  booker: z.object({
    fullName: z.string(),
    email: z.string(),
    phone: z.string(),
    age: z.number().int(),
  }),
  paymentMethod: PaymentMethodSchema,
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  promoCode: z.string().nullable(),
  holdExpiresAt: z.string(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  lines: z.array(QuoteLineDTOSchema),
  passes: z.array(IssuedPassDTOSchema),
  invoice: InvoiceSummaryDTOSchema.nullable(),
  email: z
    .object({
      status: z.enum(['pending', 'sent', 'failed']),
      toEmail: z.string(),
      subject: z.string(),
      sentAt: z.string().nullable(),
    })
    .nullable(),
});

export const SimulatedEmailResponseSchema = z.object({
  bookingId: z.string().uuid(),
  toEmail: z.string(),
  fromEmail: z.string(),
  subject: z.string(),
  sentAt: z.string(),
  simulatedMessageId: z.string(),
  htmlBody: z.string(),
  attachments: z.array(
    z.object({
      filename: z.string(),
      url: z.string(),
      contentType: z.string(),
    }),
  ),
});

export type CreateBookingRequestDTO = z.infer<typeof CreateBookingRequestSchema>;
export type CreateBookingResponseDTO = z.infer<typeof CreateBookingResponseSchema>;
export type SimulatePaymentRequestDTO = z.infer<typeof SimulatePaymentRequestSchema>;
export type SimulatePaymentResponseDTO = z.infer<typeof SimulatePaymentResponseSchema>;
export type IssuedPassDTO = z.infer<typeof IssuedPassDTOSchema>;
export type InvoiceSummaryDTO = z.infer<typeof InvoiceSummaryDTOSchema>;
export type BookingDetailResponseDTO = z.infer<typeof BookingDetailResponseSchema>;
export type SimulatedEmailResponseDTO = z.infer<typeof SimulatedEmailResponseSchema>;
