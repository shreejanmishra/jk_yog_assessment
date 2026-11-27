import { z } from 'zod';

export const ProductAvailabilityStatusSchema = z.enum(['available', 'low', 'sold_out']);

export const EventDayDTOSchema = z.object({
  date: z.string(),
  shortLabel: z.string(),
  fullLabel: z.string(),
  highlight: z.string(),
});

export const ProductDTOSchema = z.object({
  code: z.enum([
    'DAY_PASS_ADULT',
    'DAY_PASS_CHILD',
    'ALL_DAY_ADULT',
    'ALL_DAY_CHILD',
    'FAMILY_PASS',
    'DANDIYA_PAIR',
    'DINNER_PLATE',
    'GARBA_WORKSHOP',
  ]),
  name: z.string(),
  description: z.string(),
  category: z.enum(['admission', 'extra']),
  ageBand: z.enum(['adult', 'child']).nullable(),
  pricingUnit: z.enum(['flat', 'per_person_per_day', 'per_day', 'per_unit']),
  dayRule: z.enum(['choose_days', 'all_days', 'single_day', 'specific_days', 'none']),
  allowedDates: z.array(z.string()).nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  availability: z.object({
    total: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    status: ProductAvailabilityStatusSchema,
  }),
});

export const EventCatalogResponseSchema = z.object({
  event: z.object({
    slug: z.string(),
    name: z.string(),
    venue: z.string(),
    address: z.string(),
    timezone: z.string(),
    currency: z.literal('USD'),
    startsOn: z.string(),
    endsOn: z.string(),
    ageReferenceDate: z.string(),
    holdMinutes: z.number().int().positive(),
    maxAttendeesPerBooking: z.number().int().positive(),
    maxDandiyaPairsPerAttendee: z.number().int().positive(),
    todayIsoDate: z.string(),
  }),
  days: z.array(EventDayDTOSchema),
  products: z.array(ProductDTOSchema),
});

export type EventDayDTO = z.infer<typeof EventDayDTOSchema>;
export type ProductDTO = z.infer<typeof ProductDTOSchema>;
export type EventCatalogResponseDTO = z.infer<typeof EventCatalogResponseSchema>;
