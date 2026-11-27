import { z } from 'zod';

export const GuardianInputSchema = z.object({
  name: z.string().max(120),
  phone: z.string().max(30),
});

export const AttendeeExtrasInputSchema = z.object({
  dandiyaPairs: z.number().int(),
  dinnerDates: z.array(z.string()),
  workshopDates: z.array(z.string()),
});

export const AttendeeInputSchema = z.object({
  clientId: z.string().min(1).max(64),
  isBooker: z.boolean(),
  selectedCategory: z.enum(['adult', 'child', 'infant']),
  fullName: z.string().max(120),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
  age: z.number(),
  passKind: z.enum(['day_pass', 'all_day', 'family_pass', 'free_infant']),
  days: z.array(z.string()),
  familyGroupId: z.string().max(64).optional(),
  extras: AttendeeExtrasInputSchema,
  guardian: GuardianInputSchema.optional(),
});

export const FamilyGroupInputSchema = z.object({
  id: z.string().min(1).max(64),
  days: z.array(z.string()),
});

export const BookerInputSchema = z.object({
  fullName: z.string().max(120),
  email: z.string().max(254),
  phone: z.string().max(30),
  age: z.number(),
  isAttending: z.boolean(),
});

export const BookingIntentSchema = z.object({
  mode: z.enum(['individual', 'group']),
  booker: BookerInputSchema,
  attendees: z.array(AttendeeInputSchema),
  familyGroups: z.array(FamilyGroupInputSchema).default([]),
  promoCode: z.string().max(40).optional(),
});

export const QuoteLineDTOSchema = z.object({
  productCode: z.string(),
  label: z.string(),
  attendeeClientId: z.string().nullable(),
  familyGroupId: z.string().nullable(),
  eventDate: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative(),
});

export const AttendeePassPreviewDTOSchema = z.object({
  clientId: z.string(),
  fullName: z.string(),
  age: z.number().int(),
  ageBand: z.enum(['infant', 'child', 'adult']),
  requiresGuardian: z.boolean(),
  guardian: GuardianInputSchema.nullable(),
  passKind: z.enum(['day_pass', 'all_day', 'family_pass', 'free_infant']),
  passLabel: z.string(),
  validDates: z.array(z.string()),
  validDatesDisplay: z.string(),
  extrasSummary: z.array(z.string()),
});

export const PromoResultDTOSchema = z.object({
  status: z.enum(['none', 'applied', 'rejected']),
  code: z.string().nullable(),
  discountCents: z.number().int().nonnegative(),
  message: z.string().nullable(),
  rejectionCode: z.string().nullable(),
});

export const QuoteWarningDTOSchema = z.object({
  code: z.enum(['CHEAPER_OPTION_AVAILABLE', 'LOW_STOCK', 'DUPLICATE_ATTENDEE_NAME']),
  message: z.string(),
});

export const QuoteResponseSchema = z.object({
  currency: z.literal('USD'),
  lines: z.array(QuoteLineDTOSchema),
  attendeePasses: z.array(AttendeePassPreviewDTOSchema),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  promo: PromoResultDTOSchema,
  warnings: z.array(QuoteWarningDTOSchema),
});

export type BookingIntentDTO = z.infer<typeof BookingIntentSchema>;
export type QuoteLineDTO = z.infer<typeof QuoteLineDTOSchema>;
export type AttendeePassPreviewDTO = z.infer<typeof AttendeePassPreviewDTOSchema>;
export type QuoteResponseDTO = z.infer<typeof QuoteResponseSchema>;
