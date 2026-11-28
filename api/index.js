import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { attachDatabasePool } from "@vercel/functions";
import dotenv from "dotenv";
import "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { pgEnum, pgTable, timestamp, text, uuid, uniqueIndex, index, integer, boolean, jsonb, check, smallint } from "drizzle-orm/pg-core";
const ApiIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string()
});
z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    issues: z.array(ApiIssueSchema).optional()
  })
});
const ProductAvailabilityStatusSchema = z.enum(["available", "low", "sold_out"]);
const EventDayDTOSchema = z.object({
  date: z.string(),
  shortLabel: z.string(),
  fullLabel: z.string(),
  highlight: z.string()
});
const ProductDTOSchema = z.object({
  code: z.enum([
    "DAY_PASS_ADULT",
    "DAY_PASS_CHILD",
    "ALL_DAY_ADULT",
    "ALL_DAY_CHILD",
    "FAMILY_PASS",
    "DANDIYA_PAIR",
    "DINNER_PLATE",
    "GARBA_WORKSHOP"
  ]),
  name: z.string(),
  description: z.string(),
  category: z.enum(["admission", "extra"]),
  ageBand: z.enum(["adult", "child"]).nullable(),
  pricingUnit: z.enum(["flat", "per_person_per_day", "per_day", "per_unit"]),
  dayRule: z.enum(["choose_days", "all_days", "single_day", "specific_days", "none"]),
  allowedDates: z.array(z.string()).nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  availability: z.object({
    total: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    status: ProductAvailabilityStatusSchema
  })
});
z.object({
  event: z.object({
    slug: z.string(),
    name: z.string(),
    venue: z.string(),
    address: z.string(),
    timezone: z.string(),
    currency: z.literal("USD"),
    startsOn: z.string(),
    endsOn: z.string(),
    ageReferenceDate: z.string(),
    holdMinutes: z.number().int().positive(),
    maxAttendeesPerBooking: z.number().int().positive(),
    maxDandiyaPairsPerAttendee: z.number().int().positive(),
    todayIsoDate: z.string()
  }),
  days: z.array(EventDayDTOSchema),
  products: z.array(ProductDTOSchema)
});
const GuardianInputSchema = z.object({
  name: z.string().max(120),
  phone: z.string().max(30)
});
const AttendeeExtrasInputSchema = z.object({
  dandiyaPairs: z.number().int(),
  dinnerDates: z.array(z.string()),
  workshopDates: z.array(z.string())
});
const AttendeeInputSchema = z.object({
  clientId: z.string().min(1).max(64),
  isBooker: z.boolean(),
  selectedCategory: z.enum(["adult", "child", "infant"]),
  fullName: z.string().max(120),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
  age: z.number(),
  passKind: z.enum(["day_pass", "all_day", "family_pass", "free_infant"]),
  days: z.array(z.string()),
  familyGroupId: z.string().max(64).optional(),
  extras: AttendeeExtrasInputSchema,
  guardian: GuardianInputSchema.optional()
});
const FamilyGroupInputSchema = z.object({
  id: z.string().min(1).max(64),
  days: z.array(z.string())
});
const BookerInputSchema = z.object({
  fullName: z.string().max(120),
  email: z.string().max(254),
  phone: z.string().max(30),
  age: z.number(),
  isAttending: z.boolean()
});
const BookingIntentSchema = z.object({
  mode: z.enum(["individual", "group"]),
  booker: BookerInputSchema,
  attendees: z.array(AttendeeInputSchema),
  familyGroups: z.array(FamilyGroupInputSchema).default([]),
  promoCode: z.string().max(40).optional()
});
const QuoteLineDTOSchema = z.object({
  productCode: z.string(),
  label: z.string(),
  attendeeClientId: z.string().nullable(),
  familyGroupId: z.string().nullable(),
  eventDate: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative()
});
const AttendeePassPreviewDTOSchema = z.object({
  clientId: z.string(),
  fullName: z.string(),
  age: z.number().int(),
  ageBand: z.enum(["infant", "child", "adult"]),
  requiresGuardian: z.boolean(),
  guardian: GuardianInputSchema.nullable(),
  passKind: z.enum(["day_pass", "all_day", "family_pass", "free_infant"]),
  passLabel: z.string(),
  validDates: z.array(z.string()),
  validDatesDisplay: z.string(),
  extrasSummary: z.array(z.string())
});
const PromoResultDTOSchema = z.object({
  status: z.enum(["none", "applied", "rejected"]),
  code: z.string().nullable(),
  discountCents: z.number().int().nonnegative(),
  message: z.string().nullable(),
  rejectionCode: z.string().nullable()
});
const QuoteWarningDTOSchema = z.object({
  code: z.enum(["CHEAPER_OPTION_AVAILABLE", "LOW_STOCK", "DUPLICATE_ATTENDEE_NAME"]),
  message: z.string()
});
z.object({
  currency: z.literal("USD"),
  lines: z.array(QuoteLineDTOSchema),
  attendeePasses: z.array(AttendeePassPreviewDTOSchema),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  promo: PromoResultDTOSchema,
  warnings: z.array(QuoteWarningDTOSchema)
});
const PaymentMethodSchema = z.enum(["card", "stripe"]);
const CreateBookingRequestSchema = BookingIntentSchema.extend({
  paymentMethod: PaymentMethodSchema,
  expectedTotalCents: z.number().int().nonnegative()
});
z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  status: z.enum(["pending_payment", "confirmed"]),
  currency: z.literal("USD"),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  holdExpiresAt: z.string(),
  paymentMethod: PaymentMethodSchema,
  paymentUrl: z.string().nullable()
});
const SimulatePaymentRequestSchema = z.object({
  outcome: z.enum(["success", "decline", "cancel"]),
  method: PaymentMethodSchema,
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  cardholderName: z.string().max(120).optional()
});
z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  status: z.enum(["pending_payment", "confirmed", "cancelled"]),
  redirectUrl: z.string(),
  message: z.string()
});
const IssuedPassDTOSchema = z.object({
  attendeeId: z.string().uuid(),
  passCode: z.string(),
  fullName: z.string(),
  age: z.number().int(),
  ageBand: z.enum(["infant", "child", "adult"]),
  selectedCategory: z.enum(["infant", "child", "adult"]),
  passKind: z.enum(["day_pass", "all_day", "family_pass", "free_infant"]),
  passLabel: z.string(),
  validDates: z.array(z.string()),
  validDatesDisplay: z.string(),
  extrasSummary: z.array(z.string()),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  qrDataUrl: z.string().optional()
});
const InvoiceSummaryDTOSchema = z.object({
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
  promoCode: z.string().nullable()
});
const BookingDetailResponseSchema = z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  mode: z.enum(["individual", "group"]),
  status: z.enum(["pending_payment", "confirmed", "expired", "cancelled"]),
  event: z.object({
    name: z.string(),
    venue: z.string(),
    address: z.string(),
    datesLabel: z.string()
  }),
  booker: z.object({
    fullName: z.string(),
    email: z.string(),
    phone: z.string(),
    age: z.number().int()
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
  email: z.object({
    status: z.enum(["pending", "sent", "failed"]),
    toEmail: z.string(),
    subject: z.string(),
    sentAt: z.string().nullable()
  }).nullable()
});
z.object({
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
      contentType: z.string()
    })
  )
});
const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string(),
  createdAt: z.string()
});
const RequestOtpSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional()
});
z.object({
  sent: z.boolean(),
  email: z.string().email(),
  simulatedOtpCode: z.string(),
  expiresInMinutes: z.number().int().positive()
});
const VerifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().length(6),
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional()
});
z.object({
  authenticated: z.boolean(),
  user: UserProfileSchema.nullable()
});
const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30)
});
const ContributionCardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  organization: z.string(),
  category: z.enum(["charity", "seva", "event"]),
  amountCents: z.number().int().nonnegative().nullable(),
  contributedOn: z.string(),
  summary: z.string(),
  impactBadge: z.string()
});
z.object({
  contributions: z.array(ContributionCardSchema)
});
z.object({
  bookings: z.array(BookingDetailResponseSchema)
});
function cents(amount) {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Expected integer cents, received: ${String(amount)}`);
  }
  return amount;
}
const ZERO_CENTS = cents(0);
function subtractCentsClamped(amount, deduction) {
  return cents(Math.max(0, amount - deduction));
}
function multiplyCents(unitPrice, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a non-negative integer, received: ${String(quantity)}`);
  }
  return cents(unitPrice * quantity);
}
function sumCents(values) {
  let total = 0;
  for (const val of values) {
    total += val;
  }
  return cents(total);
}
function minCents(a, b) {
  return a <= b ? a : b;
}
function applyBasisPointsHalfUp(amount, bps) {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 1e4) {
    throw new RangeError(`Basis points must be an integer between 0 and 10000, received: ${String(bps)}`);
  }
  if (amount < 0) {
    throw new RangeError(`Cannot apply basis points to negative amount: ${String(amount)}`);
  }
  return cents(Math.floor((amount * bps + 5e3) / 1e4));
}
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
function formatUSD(amount) {
  return usdFormatter.format(amount / 100);
}
const MIN_AGE = 0;
const MAX_AGE = 120;
const CHILD_MIN_AGE = 5;
const ADULT_PASS_MIN_AGE = 12;
const LEGAL_ADULT_MIN_AGE = 18;
function isValidAgeInteger(age) {
  return typeof age === "number" && Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;
}
function classifyAge(age) {
  if (!isValidAgeInteger(age)) {
    throw new RangeError(`Invalid age: ${String(age)}. Expected integer between ${MIN_AGE} and ${MAX_AGE}.`);
  }
  if (age < CHILD_MIN_AGE) {
    return "infant";
  }
  if (age < ADULT_PASS_MIN_AGE) {
    return "child";
  }
  return "adult";
}
function isLegalAdultBooker(age) {
  return isValidAgeInteger(age) && age >= LEGAL_ADULT_MIN_AGE;
}
function requiresGuardian(age) {
  return isValidAgeInteger(age) && age < LEGAL_ADULT_MIN_AGE;
}
function matchesSelectedCategory(age, selectedCategory) {
  return classifyAge(age) === selectedCategory;
}
function formatCategoryLabel(category) {
  switch (category) {
    case "adult":
      return "Adult (12+)";
    case "child":
      return "Child (5–11)";
    case "infant":
      return "Under 5 (Free)";
  }
}
function buildCategoryMismatchMessage(age, selectedCategory) {
  const expected = classifyAge(age);
  const selectedText = formatCategoryLabel(selectedCategory);
  switch (expected) {
    case "infant":
      return `Age ${age} qualifies for Free Entry (Under 5). Please change the attendee type from ${selectedText} to Under 5 (Free).`;
    case "child":
      return `Age ${age} requires a Child pass (ages 5–11). Please change the attendee type from ${selectedText} to Child (5–11).`;
    case "adult":
      return `Attendees aged 12 and above require an Adult pass. Please change the attendee type from ${selectedText} to Adult (12+).`;
  }
}
const PRODUCT_CODES = {
  DAY_PASS_ADULT: "DAY_PASS_ADULT",
  DAY_PASS_CHILD: "DAY_PASS_CHILD",
  ALL_DAY_ADULT: "ALL_DAY_ADULT",
  ALL_DAY_CHILD: "ALL_DAY_CHILD",
  FAMILY_PASS: "FAMILY_PASS",
  DANDIYA_PAIR: "DANDIYA_PAIR",
  DINNER_PLATE: "DINNER_PLATE",
  GARBA_WORKSHOP: "GARBA_WORKSHOP"
};
const FESTIVAL_DAYS = [
  {
    date: "2026-12-10",
    shortLabel: "Thu 10 Dec",
    fullLabel: "Thursday, Dec 10, 2026",
    highlight: "Opening Maha Aarti, Bhajan Sandhya & Cultural Welcome"
  },
  {
    date: "2026-12-11",
    shortLabel: "Fri 11 Dec",
    fullLabel: "Friday, Dec 11, 2026",
    highlight: "Special Garba Workshop, Live Folk Orchestra & Raas Night"
  },
  {
    date: "2026-12-12",
    shortLabel: "Sat 12 Dec",
    fullLabel: "Saturday, Dec 12, 2026",
    highlight: "Grand Sharad Raas-Garba, Family Seva Showcase & Annakut"
  },
  {
    date: "2026-12-13",
    shortLabel: "Sun 13 Dec",
    fullLabel: "Sunday, Dec 13, 2026",
    highlight: "Master Garba Workshop, Youth Cultural Dance & Deepotsav"
  },
  {
    date: "2026-12-14",
    shortLabel: "Mon 14 Dec",
    fullLabel: "Monday, Dec 14, 2026",
    highlight: "Sharad Purnima Moonlit Kirtan, Prasad & Closing Blessings"
  }
];
const FESTIVAL_DATE_SET = new Set(FESTIVAL_DAYS.map((d) => d.date));
const GARBA_WORKSHOP_DATES = ["2026-12-11", "2026-12-13"];
const EVENT_METADATA = {
  slug: "sharad-utsav-2026",
  name: "Sharad Utsav 2026",
  venue: "Radha Krishna Temple, Allen, Texas",
  address: "1450 N Watters Rd, Allen, TX 75013",
  timezone: "America/Chicago",
  currency: "USD",
  startsOn: "2026-12-10",
  endsOn: "2026-12-14",
  ageReferenceDate: "2026-12-10",
  holdMinutes: 10,
  maxAttendeesPerBooking: 20,
  maxDandiyaPairsPerAttendee: 20
};
const DEFAULT_CATALOG = [
  {
    code: PRODUCT_CODES.DAY_PASS_ADULT,
    name: "Day Pass – Adult",
    description: "Ages 12 and above · Valid on any chosen festival day(s).",
    category: "admission",
    ageBand: "adult",
    pricingUnit: "per_person_per_day",
    dayRule: "choose_days",
    allowedDates: null,
    unitPriceCents: cents(1500),
    totalStock: 380,
    remainingStock: 380,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 1
  },
  {
    code: PRODUCT_CODES.DAY_PASS_CHILD,
    name: "Day Pass – Child",
    description: "Ages 5 to 11 · Valid on any chosen festival day(s).",
    category: "admission",
    ageBand: "child",
    pricingUnit: "per_person_per_day",
    dayRule: "choose_days",
    allowedDates: null,
    unitPriceCents: cents(800),
    totalStock: 260,
    remainingStock: 260,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 2
  },
  {
    code: PRODUCT_CODES.ALL_DAY_ADULT,
    name: "All-Day Pass – Adult",
    description: "Ages 12 and above · Covers all 5 festival days.",
    category: "admission",
    ageBand: "adult",
    pricingUnit: "flat",
    dayRule: "all_days",
    allowedDates: null,
    unitPriceCents: cents(6e3),
    totalStock: 0,
    remainingStock: 0,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 3
  },
  {
    code: PRODUCT_CODES.ALL_DAY_CHILD,
    name: "All-Day Pass – Child",
    description: "Ages 5 to 11 · Covers all 5 festival days.",
    category: "admission",
    ageBand: "child",
    pricingUnit: "flat",
    dayRule: "all_days",
    allowedDates: null,
    unitPriceCents: cents(3e3),
    totalStock: 140,
    remainingStock: 140,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 4
  },
  {
    code: PRODUCT_CODES.FAMILY_PASS,
    name: "Family Pass",
    description: "Covers up to 2 adults (12+) and 2 children (5–11) for one single day.",
    category: "admission",
    ageBand: null,
    pricingUnit: "per_day",
    dayRule: "single_day",
    allowedDates: null,
    unitPriceCents: cents(4e3),
    totalStock: 95,
    remainingStock: 95,
    maxAdults: 2,
    maxChildren: 2,
    sortOrder: 5
  },
  {
    code: PRODUCT_CODES.DANDIYA_PAIR,
    name: "Dandiya Sticks (Pair)",
    description: "Traditional decorated wooden dandiya sticks souvenir pair.",
    category: "extra",
    ageBand: null,
    pricingUnit: "per_unit",
    dayRule: "none",
    allowedDates: null,
    unitPriceCents: cents(500),
    totalStock: 900,
    remainingStock: 900,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 6
  },
  {
    code: PRODUCT_CODES.DINNER_PLATE,
    name: "Dinner Plate",
    description: "Freshly prepared sattvic festival dinner · Priced per person, per day.",
    category: "extra",
    ageBand: null,
    pricingUnit: "per_person_per_day",
    dayRule: "choose_days",
    allowedDates: null,
    unitPriceCents: cents(1200),
    totalStock: 1700,
    remainingStock: 1700,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 7
  },
  {
    code: PRODUCT_CODES.GARBA_WORKSHOP,
    name: "Garba Workshop",
    description: "Guided choreography workshop · Runs on Fri 11 Dec & Sun 13 Dec only.",
    category: "extra",
    ageBand: null,
    pricingUnit: "per_unit",
    dayRule: "specific_days",
    allowedDates: GARBA_WORKSHOP_DATES,
    unitPriceCents: cents(2e3),
    totalStock: 2,
    remainingStock: 2,
    maxAdults: null,
    maxChildren: null,
    sortOrder: 8
  }
];
function buildCatalogMap(products2) {
  const map = /* @__PURE__ */ new Map();
  for (const product of products2) {
    map.set(product.code, product);
  }
  return map;
}
function getStockStatus(remaining) {
  if (remaining <= 0) return "sold_out";
  if (remaining <= 10) return "low";
  return "available";
}
const DEFAULT_PROMOS = [
  {
    code: "SEVA10",
    description: "10% off the entire booking",
    discountType: "percent",
    percentBps: 1e3,
    amountCents: null,
    minSubtotalExclusiveCents: null,
    validFromIso: "2026-01-01T00:00:00Z",
    validUntilIso: "2026-12-15T05:59:59Z",
    maxUses: null,
    usedCount: 0,
    isActive: true
  },
  {
    code: "FLAT20",
    description: "$20 off bookings over $40",
    discountType: "fixed",
    percentBps: null,
    amountCents: cents(2e3),
    minSubtotalExclusiveCents: cents(4e3),
    validFromIso: "2026-01-01T00:00:00Z",
    validUntilIso: "2026-12-15T05:59:59Z",
    maxUses: null,
    usedCount: 0,
    isActive: true
  },
  {
    code: "KIDSFREE",
    description: "Makes Child Day and Child All-Day passes free",
    discountType: "child_admissions_free",
    percentBps: null,
    amountCents: null,
    minSubtotalExclusiveCents: null,
    validFromIso: "2026-01-01T00:00:00Z",
    validUntilIso: "2026-12-15T05:59:59Z",
    maxUses: null,
    usedCount: 0,
    isActive: true
  },
  {
    code: "EXPIRED5",
    description: "5% early-bird code that expired last month",
    discountType: "percent",
    percentBps: 500,
    amountCents: null,
    minSubtotalExclusiveCents: null,
    validFromIso: "2026-09-01T00:00:00Z",
    validUntilIso: "2026-11-15T23:59:59Z",
    maxUses: null,
    usedCount: 12,
    isActive: true
  },
  {
    code: "MAXEDOUT",
    description: "Limited launch promo that reached maximum redemptions",
    discountType: "fixed",
    percentBps: null,
    amountCents: cents(1e3),
    minSubtotalExclusiveCents: null,
    validFromIso: "2026-01-01T00:00:00Z",
    validUntilIso: "2026-12-15T05:59:59Z",
    maxUses: 50,
    usedCount: 50,
    isActive: true
  }
];
function normalizePromoCode(raw) {
  return (raw ?? "").trim().toUpperCase();
}
function evaluatePromoCode(params) {
  const code = normalizePromoCode(params.rawCode);
  if (!code) {
    return {
      status: "none",
      code: null,
      discountCents: ZERO_CENTS,
      message: null,
      rejectionCode: null
    };
  }
  const promo = params.promosByCode.get(code);
  if (!promo || !promo.isActive) {
    return {
      status: "rejected",
      code,
      discountCents: ZERO_CENTS,
      message: `"${code}" is not a recognized promo code. Please check the spelling and try again.`,
      rejectionCode: "PROMO_NOT_FOUND"
    };
  }
  if (promo.validUntilIso && params.nowIso > promo.validUntilIso) {
    const expiredDate = promo.validUntilIso.slice(0, 10);
    return {
      status: "rejected",
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `Code "${promo.code}" expired on ${expiredDate} and can no longer be used.`,
      rejectionCode: "PROMO_EXPIRED"
    };
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return {
      status: "rejected",
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `Code "${promo.code}" has already reached its maximum usage limit (${promo.maxUses} uses).`,
      rejectionCode: "PROMO_EXHAUSTED"
    };
  }
  if (params.priorRedemption) {
    return {
      status: "rejected",
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `Coupon limit reached: ${params.priorRedemption.participantLabel} already benefited from promo code ${params.priorRedemption.promoCode} on booking ${params.priorRedemption.bookingReference}. Coupons are limited to 1 per booker and attendee.`,
      rejectionCode: "PROMO_ALREADY_USED"
    };
  }
  if (promo.minSubtotalExclusiveCents !== null && params.subtotalCents <= promo.minSubtotalExclusiveCents) {
    return {
      status: "rejected",
      code: promo.code,
      discountCents: ZERO_CENTS,
      message: `${promo.code} is only applicable when your booking subtotal is more than ${formatUSD(promo.minSubtotalExclusiveCents)} (current subtotal is ${formatUSD(params.subtotalCents)}).`,
      rejectionCode: "PROMO_NOT_APPLICABLE"
    };
  }
  switch (promo.discountType) {
    case "percent": {
      const bps = promo.percentBps ?? 0;
      const discount = minCents(
        applyBasisPointsHalfUp(params.subtotalCents, bps),
        params.subtotalCents
      );
      const pct = (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2);
      return {
        status: "applied",
        code: promo.code,
        discountCents: discount,
        message: `${promo.code} applied: ${pct}% off (${formatUSD(discount)} saved).`,
        rejectionCode: null
      };
    }
    case "fixed": {
      const rawAmount = promo.amountCents ?? ZERO_CENTS;
      const discount = minCents(rawAmount, params.subtotalCents);
      const cappedNote = discount < rawAmount ? " (capped at your booking subtotal)" : "";
      return {
        status: "applied",
        code: promo.code,
        discountCents: discount,
        message: `${promo.code} applied: ${formatUSD(discount)} off${cappedNote}.`,
        rejectionCode: null
      };
    }
    case "child_admissions_free": {
      const childTicketLines = params.lines.filter(
        (line) => line.productCode === PRODUCT_CODES.DAY_PASS_CHILD || line.productCode === PRODUCT_CODES.ALL_DAY_CHILD
      );
      const childSubtotal = sumCents(childTicketLines.map((l) => l.lineTotalCents));
      if (childSubtotal === 0) {
        return {
          status: "rejected",
          code: promo.code,
          discountCents: ZERO_CENTS,
          message: "KIDSFREE is not applicable because there are no Child (ages 5–11) Day or All-Day passes in this booking.",
          rejectionCode: "PROMO_NOT_APPLICABLE"
        };
      }
      const discount = minCents(childSubtotal, params.subtotalCents);
      return {
        status: "applied",
        code: promo.code,
        discountCents: discount,
        message: `KIDSFREE applied: Child entry tickets are free (${formatUSD(discount)} saved).`,
        rejectionCode: null
      };
    }
  }
}
function resolveAttendeeValidDays(attendee, familyGroupsById) {
  switch (attendee.passKind) {
    case "all_day":
      return FESTIVAL_DAYS.map((d) => d.date);
    case "family_pass": {
      const group = attendee.familyGroupId ? familyGroupsById.get(attendee.familyGroupId) : void 0;
      return group ? [...new Set(group.days)].sort() : [];
    }
    case "day_pass":
    case "free_infant":
      return [...new Set(attendee.days)].sort();
  }
}
function validateChosenDays(days, path, todayIsoDate, violations) {
  if (days.length === 0) {
    violations.push({
      code: "DAY_PASS_NO_DAYS",
      path,
      message: "Please select at least one festival day."
    });
    return;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const day of days) {
    if (!FESTIVAL_DATE_SET.has(day)) {
      violations.push({
        code: "INVALID_FESTIVAL_DAY",
        path,
        message: `${day} is outside the Sharad Utsav 2026 dates (${EVENT_METADATA.startsOn} to ${EVENT_METADATA.endsOn}).`
      });
    } else if (day < todayIsoDate) {
      violations.push({
        code: "DAY_IN_PAST",
        path,
        message: `Festival day ${day} has already passed and cannot be booked.`
      });
    }
    if (seen.has(day)) {
      violations.push({
        code: "DUPLICATE_DAY",
        path,
        message: `Duplicate day ${day} is not allowed.`
      });
    }
    seen.add(day);
  }
}
function checkAdmissionRules(intent, catalogMap, todayIsoDate) {
  const violations = [];
  const familyGroupsById = /* @__PURE__ */ new Map();
  intent.familyGroups.forEach((group, groupIndex) => {
    familyGroupsById.set(group.id, group);
    validateChosenDays(group.days, `familyGroups[${groupIndex}].days`, todayIsoDate, violations);
  });
  const membersByFamilyGroup = /* @__PURE__ */ new Map();
  intent.attendees.forEach((attendee, index2) => {
    const basePath = `attendees[${index2}]`;
    if (!isValidAgeInteger(attendee.age)) {
      return;
    }
    const band = classifyAge(attendee.age);
    if (band === "infant") {
      if (attendee.passKind !== "free_infant") {
        violations.push({
          code: "PASS_KIND_INCOMPATIBLE",
          path: `${basePath}.passKind`,
          message: "Children under 5 enter free and do not require a paid pass."
        });
      } else {
        validateChosenDays(attendee.days, `${basePath}.days`, todayIsoDate, violations);
      }
      return;
    }
    if (attendee.passKind === "free_infant") {
      violations.push({
        code: "PASS_KIND_INCOMPATIBLE",
        path: `${basePath}.passKind`,
        message: "Free infant entry is only valid for children under age 5."
      });
      return;
    }
    if (attendee.passKind === "day_pass") {
      validateChosenDays(attendee.days, `${basePath}.days`, todayIsoDate, violations);
    } else if (attendee.passKind === "all_day") {
      if (EVENT_METADATA.startsOn < todayIsoDate) {
        violations.push({
          code: "DAY_IN_PAST",
          path: `${basePath}.passKind`,
          message: "All-Day passes are unavailable once the festival has already started."
        });
      }
    } else if (attendee.passKind === "family_pass") {
      if (!attendee.familyGroupId || !familyGroupsById.has(attendee.familyGroupId)) {
        violations.push({
          code: "FAMILY_GROUP_UNKNOWN",
          path: `${basePath}.familyGroupId`,
          message: "Attendee references a Family Pass group that does not exist."
        });
      } else {
        const list = membersByFamilyGroup.get(attendee.familyGroupId) ?? [];
        list.push(attendee);
        membersByFamilyGroup.set(attendee.familyGroupId, list);
      }
    }
  });
  const familyProduct = catalogMap.get(PRODUCT_CODES.FAMILY_PASS);
  const maxAdults = familyProduct?.maxAdults ?? 2;
  const maxChildren = familyProduct?.maxChildren ?? 2;
  intent.familyGroups.forEach((group, groupIndex) => {
    const members = membersByFamilyGroup.get(group.id) ?? [];
    if (members.length === 0) {
      violations.push({
        code: "FAMILY_GROUP_EMPTY",
        path: `familyGroups[${groupIndex}]`,
        message: "Family Pass must have eligible attendees assigned to it."
      });
      return;
    }
    let adultCount = 0;
    let childCount = 0;
    for (const m of members) {
      if (!isValidAgeInteger(m.age)) continue;
      const band = classifyAge(m.age);
      if (band === "adult") adultCount += 1;
      if (band === "child") childCount += 1;
    }
    if (adultCount < 1 || adultCount > maxAdults || childCount > maxChildren || adultCount + childCount < 2) {
      violations.push({
        code: "FAMILY_GROUP_COMPOSITION",
        path: `familyGroups[${groupIndex}]`,
        message: `A Family Pass covers 1–${maxAdults} adults (12+) and up to ${maxChildren} children (5–11), with at least 2 members total.`
      });
    }
  });
  return violations;
}
const SHORT_LABEL_BY_DATE = new Map(FESTIVAL_DAYS.map((d) => [d.date, d.shortLabel]));
function formatDatesDisplay(dates) {
  if (dates.length === FESTIVAL_DAYS.length) {
    return "All 5 Days (Thu 10 Dec – Mon 14 Dec 2026)";
  }
  return dates.map((d) => SHORT_LABEL_BY_DATE.get(d) ?? d).join(", ");
}
function expandAndPriceItems(intent, catalogMap) {
  const lines = [];
  const demand = /* @__PURE__ */ new Map();
  const familyGroupsById = new Map(
    intent.familyGroups.map((g) => [g.id, g])
  );
  const addDemand = (code, qty) => {
    if (qty <= 0) return;
    demand.set(code, (demand.get(code) ?? 0) + qty);
  };
  const requireProduct = (code) => {
    const product = catalogMap.get(code);
    if (!product) {
      throw new Error(`Catalog missing required product code: ${code}`);
    }
    return product;
  };
  for (const group of intent.familyGroups) {
    const uniqueDays = [...new Set(group.days)].sort();
    const product = requireProduct(PRODUCT_CODES.FAMILY_PASS);
    for (const date of uniqueDays) {
      const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
      lines.push({
        productCode: product.code,
        label: `${product.name} (${dateLabel})`,
        attendeeClientId: null,
        familyGroupId: group.id,
        eventDate: date,
        quantity: 1,
        unitPriceCents: product.unitPriceCents,
        lineTotalCents: multiplyCents(product.unitPriceCents, 1)
      });
      addDemand(product.code, 1);
    }
  }
  const attendeePasses = [];
  for (const attendee of intent.attendees) {
    const band = classifyAge(attendee.age);
    const validDates = resolveAttendeeValidDays(attendee, familyGroupsById);
    let passLabel = "";
    if (attendee.passKind === "free_infant") {
      passLabel = "Under 5 Free Entry Pass";
    } else if (attendee.passKind === "family_pass") {
      passLabel = band === "adult" ? "Family Pass – Adult Member" : "Family Pass – Child Member";
    } else if (attendee.passKind === "all_day") {
      const code = band === "adult" ? PRODUCT_CODES.ALL_DAY_ADULT : PRODUCT_CODES.ALL_DAY_CHILD;
      const product = requireProduct(code);
      passLabel = product.name;
      lines.push({
        productCode: product.code,
        label: `${product.name} — ${attendee.fullName.trim()}`,
        attendeeClientId: attendee.clientId,
        familyGroupId: null,
        eventDate: null,
        quantity: 1,
        unitPriceCents: product.unitPriceCents,
        lineTotalCents: multiplyCents(product.unitPriceCents, 1)
      });
      addDemand(product.code, 1);
    } else if (attendee.passKind === "day_pass") {
      const code = band === "adult" ? PRODUCT_CODES.DAY_PASS_ADULT : PRODUCT_CODES.DAY_PASS_CHILD;
      const product = requireProduct(code);
      passLabel = product.name;
      for (const date of validDates) {
        const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
        lines.push({
          productCode: product.code,
          label: `${product.name} (${dateLabel}) — ${attendee.fullName.trim()}`,
          attendeeClientId: attendee.clientId,
          familyGroupId: null,
          eventDate: date,
          quantity: 1,
          unitPriceCents: product.unitPriceCents,
          lineTotalCents: multiplyCents(product.unitPriceCents, 1)
        });
        addDemand(product.code, 1);
      }
    }
    const extrasSummary = [];
    const sortedDinners = [...new Set(attendee.extras.dinnerDates)].sort();
    if (sortedDinners.length > 0) {
      const dinnerProduct = requireProduct(PRODUCT_CODES.DINNER_PLATE);
      for (const date of sortedDinners) {
        const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
        lines.push({
          productCode: dinnerProduct.code,
          label: `${dinnerProduct.name} (${dateLabel}) — ${attendee.fullName.trim()}`,
          attendeeClientId: attendee.clientId,
          familyGroupId: null,
          eventDate: date,
          quantity: 1,
          unitPriceCents: dinnerProduct.unitPriceCents,
          lineTotalCents: multiplyCents(dinnerProduct.unitPriceCents, 1)
        });
        addDemand(dinnerProduct.code, 1);
      }
      extrasSummary.push(
        `Dinner Plate (${sortedDinners.map((d) => SHORT_LABEL_BY_DATE.get(d) ?? d).join(", ")})`
      );
    }
    const sortedWorkshops = [...new Set(attendee.extras.workshopDates)].sort();
    if (sortedWorkshops.length > 0) {
      const workshopProduct = requireProduct(PRODUCT_CODES.GARBA_WORKSHOP);
      for (const date of sortedWorkshops) {
        const dateLabel = SHORT_LABEL_BY_DATE.get(date) ?? date;
        lines.push({
          productCode: workshopProduct.code,
          label: `${workshopProduct.name} (${dateLabel}) — ${attendee.fullName.trim()}`,
          attendeeClientId: attendee.clientId,
          familyGroupId: null,
          eventDate: date,
          quantity: 1,
          unitPriceCents: workshopProduct.unitPriceCents,
          lineTotalCents: multiplyCents(workshopProduct.unitPriceCents, 1)
        });
        addDemand(workshopProduct.code, 1);
      }
      extrasSummary.push(
        `Garba Workshop (${sortedWorkshops.map((d) => SHORT_LABEL_BY_DATE.get(d) ?? d).join(", ")})`
      );
    }
    if (attendee.extras.dandiyaPairs > 0) {
      const dandiyaProduct = requireProduct(PRODUCT_CODES.DANDIYA_PAIR);
      const pairs = attendee.extras.dandiyaPairs;
      lines.push({
        productCode: dandiyaProduct.code,
        label: `${dandiyaProduct.name} × ${pairs} — ${attendee.fullName.trim()}`,
        attendeeClientId: attendee.clientId,
        familyGroupId: null,
        eventDate: null,
        quantity: pairs,
        unitPriceCents: dandiyaProduct.unitPriceCents,
        lineTotalCents: multiplyCents(dandiyaProduct.unitPriceCents, pairs)
      });
      addDemand(dandiyaProduct.code, pairs);
      extrasSummary.push(`Dandiya Sticks × ${pairs} pair${pairs > 1 ? "s" : ""}`);
    }
    const minor = requiresGuardian(attendee.age);
    attendeePasses.push({
      clientId: attendee.clientId,
      fullName: attendee.fullName.trim(),
      email: attendee.email?.trim() ? attendee.email.trim() : null,
      phone: attendee.phone?.trim() ? attendee.phone.trim() : null,
      age: attendee.age,
      ageBand: band,
      requiresGuardian: minor,
      guardian: minor && attendee.guardian ? { name: attendee.guardian.name.trim(), phone: attendee.guardian.phone.trim() } : null,
      passKind: attendee.passKind,
      passLabel,
      validDates,
      validDatesDisplay: formatDatesDisplay(validDates),
      extrasSummary: extrasSummary.length > 0 ? extrasSummary : ["None"]
    });
  }
  const stockViolations = [];
  for (const [code, qty] of demand.entries()) {
    const product = requireProduct(code);
    if (product.remainingStock <= 0) {
      stockViolations.push({
        code: "PRODUCT_SOLD_OUT",
        path: `stock.${code}`,
        message: `${product.name} is sold out.`
      });
    } else if (qty > product.remainingStock) {
      stockViolations.push({
        code: "INSUFFICIENT_STOCK",
        path: `stock.${code}`,
        message: `Only ${product.remainingStock} ${product.name} remaining, cannot book ${qty}.`
      });
    }
  }
  const subtotalCents = lines.length > 0 ? sumCents(lines.map((l) => l.lineTotalCents)) : ZERO_CENTS;
  return {
    lines,
    subtotalCents,
    stockDemand: demand,
    stockViolations,
    attendeePasses
  };
}
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_CHARS = /^[+\d\s().-]+$/;
function isValidEmail(value) {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}
function normalizeEmail(value) {
  return value.trim().toLowerCase();
}
function normalizePhoneDigits(value) {
  return value.replace(/\D/g, "");
}
function normalizePhoneKey(value) {
  const digits = normalizePhoneDigits(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}
function normalizePersonName(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
function isValidPhone(value) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!PHONE_ALLOWED_CHARS.test(trimmed)) return false;
  const digits = normalizePhoneDigits(trimmed);
  return digits.length >= 7 && digits.length <= 15;
}
function computeAttendeeIdentityKey(input) {
  if (input.category === "adult") {
    if (!input.phone || !isValidPhone(input.phone)) return null;
    return `adult_phone:${normalizePhoneKey(input.phone)}`;
  }
  const normName = normalizePersonName(input.fullName);
  if (normName.length < 2 || !input.guardianPhone || !isValidPhone(input.guardianPhone)) {
    return null;
  }
  return `minor_guardian_name:${normalizePhoneKey(input.guardianPhone)}::${normName}`;
}
function collectPromoParticipants(input) {
  const byKey = /* @__PURE__ */ new Map();
  const add = (key, label) => {
    if (!key || byKey.has(key)) return;
    byKey.set(key, label);
  };
  const bookerLabel = input.booker.fullName.trim() || "Lead booker";
  if (isValidPhone(input.booker.phone)) {
    add(`person_phone:${normalizePhoneKey(input.booker.phone)}`, bookerLabel);
  }
  if (isValidEmail(input.booker.email)) {
    add(`person_email:${normalizeEmail(input.booker.email)}`, bookerLabel);
  }
  for (const att of input.attendees) {
    const attLabel = att.fullName.trim() || "Attendee";
    if (att.category === "adult") {
      if (att.phone && isValidPhone(att.phone)) {
        add(`person_phone:${normalizePhoneKey(att.phone)}`, attLabel);
      }
      if (att.email && isValidEmail(att.email)) {
        add(`person_email:${normalizeEmail(att.email)}`, attLabel);
      }
    } else {
      const minorKey = computeAttendeeIdentityKey({
        category: att.category,
        fullName: att.fullName,
        phone: att.phone,
        guardianPhone: att.guardianPhone
      });
      add(minorKey, attLabel);
      if (att.phone && isValidPhone(att.phone)) {
        add(`person_phone:${normalizePhoneKey(att.phone)}`, attLabel);
      }
    }
  }
  return [...byKey.entries()].map(([key, label]) => ({ key, label }));
}
function checkAttendeeRules(intent) {
  const violations = [];
  const { attendees, mode, booker } = intent;
  if (attendees.length === 0) {
    violations.push({
      code: "NO_ATTENDEES",
      path: "attendees",
      message: "Add at least one attendee to continue."
    });
    return violations;
  }
  if (attendees.length > EVENT_METADATA.maxAttendeesPerBooking) {
    violations.push({
      code: "GROUP_TOO_LARGE",
      path: "attendees",
      message: `A single booking can include at most ${EVENT_METADATA.maxAttendeesPerBooking} attendees.`
    });
  }
  if (mode === "individual") {
    if (attendees.length !== 1 || !attendees[0]?.isBooker) {
      violations.push({
        code: "INDIVIDUAL_MODE_COUNT",
        path: "mode",
        message: "Individual booking covers only the primary booker. Switch to Group Booking to add others."
      });
    } else if (isValidAgeInteger(booker.age) && attendees[0].age !== booker.age) {
      violations.push({
        code: "INDIVIDUAL_MODE_COUNT",
        path: "attendees[0].age",
        message: "In Individual mode, the attendee age must match the booker age."
      });
    }
  }
  const seenIdentityKeys = /* @__PURE__ */ new Map();
  attendees.forEach((attendee, index2) => {
    const basePath = `attendees[${index2}]`;
    if (attendee.fullName.trim().length < 2) {
      violations.push({
        code: "ATTENDEE_NAME_REQUIRED",
        path: `${basePath}.fullName`,
        message: "Please enter the attendee’s full name."
      });
    }
    if (!isValidAgeInteger(attendee.age)) {
      violations.push({
        code: "AGE_INVALID",
        path: `${basePath}.age`,
        message: "Please enter a whole-number age between 0 and 120."
      });
    } else if (!matchesSelectedCategory(attendee.age, attendee.selectedCategory)) {
      violations.push({
        code: "ATTENDEE_TYPE_AGE_MISMATCH",
        path: `${basePath}.age`,
        message: buildCategoryMismatchMessage(attendee.age, attendee.selectedCategory)
      });
    }
    if (attendee.selectedCategory === "adult") {
      if (!attendee.phone || attendee.phone.trim().length === 0) {
        violations.push({
          code: "ATTENDEE_PHONE_REQUIRED",
          path: `${basePath}.phone`,
          message: "Phone number is required for adult passholders."
        });
      } else if (!isValidPhone(attendee.phone)) {
        violations.push({
          code: "ATTENDEE_PHONE_INVALID",
          path: `${basePath}.phone`,
          message: "Please enter a valid phone number (7–15 digits)."
        });
      }
    } else if (attendee.phone && attendee.phone.trim().length > 0 && !isValidPhone(attendee.phone)) {
      violations.push({
        code: "ATTENDEE_PHONE_INVALID",
        path: `${basePath}.phone`,
        message: "Please enter a valid optional phone number (7–15 digits)."
      });
    }
    if (attendee.email && attendee.email.trim().length > 0 && !isValidEmail(attendee.email)) {
      violations.push({
        code: "ATTENDEE_EMAIL_INVALID",
        path: `${basePath}.email`,
        message: "Please enter a valid email address."
      });
    }
    const identityKey = computeAttendeeIdentityKey({
      category: attendee.selectedCategory,
      fullName: attendee.fullName,
      phone: attendee.phone,
      guardianPhone: attendee.guardian?.phone
    });
    if (identityKey !== null) {
      const existing = seenIdentityKeys.get(identityKey);
      if (existing) {
        if (attendee.selectedCategory === "adult") {
          violations.push({
            code: "DUPLICATE_ATTENDEE",
            path: `${basePath}.phone`,
            message: `Duplicate passholder: phone number matches ${existing.fullName || `Attendee ${existing.index + 1}`}. Each adult or minor (12+) passholder must have a unique phone number.`
          });
        } else {
          violations.push({
            code: "DUPLICATE_ATTENDEE",
            path: `${basePath}.fullName`,
            message: `Duplicate passholder: "${attendee.fullName.trim()}" is already included under guardian phone ${attendee.guardian?.phone.trim() ?? ""}.`
          });
        }
      } else {
        seenIdentityKeys.set(identityKey, {
          index: index2,
          fullName: attendee.fullName.trim()
        });
      }
    }
  });
  return violations;
}
function checkBookerRules(intent) {
  const violations = [];
  const { booker } = intent;
  if (booker.fullName.trim().length < 2) {
    violations.push({
      code: "BOOKER_NAME_REQUIRED",
      path: "booker.fullName",
      message: "Please enter the booker’s full name (at least 2 characters)."
    });
  }
  if (!isValidEmail(booker.email)) {
    violations.push({
      code: "BOOKER_EMAIL_INVALID",
      path: "booker.email",
      message: "Please enter a valid email address for booking confirmation."
    });
  }
  if (!isValidPhone(booker.phone)) {
    violations.push({
      code: "BOOKER_PHONE_INVALID",
      path: "booker.phone",
      message: "Please enter a valid contact phone number (7–15 digits)."
    });
  }
  if (!isValidAgeInteger(booker.age)) {
    violations.push({
      code: "AGE_INVALID",
      path: "booker.age",
      message: "Please enter a valid whole-number age between 0 and 120."
    });
  } else if (!isLegalAdultBooker(booker.age)) {
    violations.push({
      code: "BOOKER_UNDER_18",
      path: "booker.age",
      message: `Booker must be ${LEGAL_ADULT_MIN_AGE} or older to book tickets (entered age ${booker.age}).`
    });
  }
  return violations;
}
function checkExtrasRules(intent, catalogMap) {
  const violations = [];
  const familyGroupsById = new Map(
    intent.familyGroups.map((g) => [g.id, g])
  );
  const workshopProduct = catalogMap.get(PRODUCT_CODES.GARBA_WORKSHOP);
  const allowedWorkshopSet = new Set(workshopProduct?.allowedDates ?? GARBA_WORKSHOP_DATES);
  intent.attendees.forEach((attendee, index2) => {
    const basePath = `attendees[${index2}].extras`;
    const validDays = new Set(resolveAttendeeValidDays(attendee, familyGroupsById));
    const { dandiyaPairs, dinnerDates, workshopDates } = attendee.extras;
    if (!Number.isInteger(dandiyaPairs) || dandiyaPairs < 0 || dandiyaPairs > EVENT_METADATA.maxDandiyaPairsPerAttendee) {
      violations.push({
        code: "QUANTITY_OUT_OF_RANGE",
        path: `${basePath}.dandiyaPairs`,
        message: `Dandiya Stick pairs must be a whole number between 0 and ${EVENT_METADATA.maxDandiyaPairsPerAttendee}.`
      });
    }
    const seenDinner = /* @__PURE__ */ new Set();
    for (const date of dinnerDates) {
      if (seenDinner.has(date)) {
        violations.push({
          code: "DUPLICATE_DAY",
          path: `${basePath}.dinnerDates`,
          message: `Duplicate dinner plate date ${date} for ${attendee.fullName || "attendee"}.`
        });
      }
      seenDinner.add(date);
      if (!FESTIVAL_DATE_SET.has(date) || !validDays.has(date)) {
        violations.push({
          code: "EXTRA_DAY_NOT_ATTENDING",
          path: `${basePath}.dinnerDates`,
          message: `Dinner Plate on ${date} requires ${attendee.fullName || "the attendee"} to hold a pass valid on ${date}.`
        });
      }
    }
    if (workshopDates.length > 0 && isValidAgeInteger(attendee.age) && classifyAge(attendee.age) === "infant") {
      violations.push({
        code: "WORKSHOP_INFANT_INELIGIBLE",
        path: `${basePath}.workshopDates`,
        message: "Garba Workshop is only open to ticketed attendees aged 5 and above."
      });
    }
    const seenWorkshop = /* @__PURE__ */ new Set();
    for (const date of workshopDates) {
      if (seenWorkshop.has(date)) {
        violations.push({
          code: "DUPLICATE_DAY",
          path: `${basePath}.workshopDates`,
          message: `Duplicate Garba Workshop date ${date}.`
        });
      }
      seenWorkshop.add(date);
      if (!allowedWorkshopSet.has(date)) {
        violations.push({
          code: "WORKSHOP_DAY_INVALID",
          path: `${basePath}.workshopDates`,
          message: `Garba Workshop runs on Fri 11 Dec and Sun 13 Dec only (${date} is unavailable).`
        });
      } else if (!validDays.has(date)) {
        violations.push({
          code: "EXTRA_DAY_NOT_ATTENDING",
          path: `${basePath}.workshopDates`,
          message: `Garba Workshop on ${date} requires a pass valid on ${date}.`
        });
      }
    }
  });
  return violations;
}
function checkGuardianRules(intent) {
  const violations = [];
  const minorAttendees = intent.attendees.filter(
    (a) => isValidAgeInteger(a.age) && requiresGuardian(a.age)
  );
  intent.attendees.forEach((attendee, index2) => {
    if (!isValidAgeInteger(attendee.age) || !requiresGuardian(attendee.age)) {
      return;
    }
    const basePath = `attendees[${index2}].guardian`;
    const guardianName = attendee.guardian?.name?.trim() ?? "";
    const guardianPhone = attendee.guardian?.phone?.trim() ?? "";
    const attendeeNormName = normalizePersonName(attendee.fullName);
    const guardianNormName = normalizePersonName(guardianName);
    if (guardianName.length < 2) {
      violations.push({
        code: "GUARDIAN_NAME_REQUIRED",
        path: `${basePath}.name`,
        message: `Guardian name is required because ${attendee.fullName.trim() || "this attendee"} is under 18 (age ${attendee.age}).`
      });
    } else if (attendeeNormName.length >= 2 && guardianNormName === attendeeNormName) {
      violations.push({
        code: "GUARDIAN_SELF_MATCH",
        path: `${basePath}.name`,
        message: "Guardian full name cannot be the same as the minor’s own name."
      });
    } else {
      const otherMinorByName = minorAttendees.find(
        (m) => m.clientId !== attendee.clientId && normalizePersonName(m.fullName) === guardianNormName
      );
      if (otherMinorByName) {
        violations.push({
          code: "GUARDIAN_SELF_MATCH",
          path: `${basePath}.name`,
          message: `Guardian must be an adult aged 18 or over, not a minor in this booking (${otherMinorByName.fullName.trim()}).`
        });
      }
    }
    if (guardianPhone.length === 0) {
      violations.push({
        code: "GUARDIAN_PHONE_REQUIRED",
        path: `${basePath}.phone`,
        message: `Guardian phone number is required because ${attendee.fullName.trim() || "this attendee"} is under 18 (age ${attendee.age}).`
      });
    } else if (!isValidPhone(guardianPhone)) {
      violations.push({
        code: "GUARDIAN_PHONE_INVALID",
        path: `${basePath}.phone`,
        message: "Please enter a valid guardian phone number (7–15 digits)."
      });
    } else {
      const guardianPhoneKey = normalizePhoneKey(guardianPhone);
      if (attendee.phone && isValidPhone(attendee.phone) && normalizePhoneKey(attendee.phone) === guardianPhoneKey) {
        violations.push({
          code: "GUARDIAN_SELF_MATCH",
          path: `${basePath}.phone`,
          message: "Guardian phone number cannot be the same as the minor’s own phone number."
        });
      } else {
        const otherMinorByPhone = minorAttendees.find(
          (m) => m.clientId !== attendee.clientId && m.phone && isValidPhone(m.phone) && normalizePhoneKey(m.phone) === guardianPhoneKey
        );
        if (otherMinorByPhone) {
          violations.push({
            code: "GUARDIAN_SELF_MATCH",
            path: `${basePath}.phone`,
            message: `Guardian phone number belongs to a minor in this booking (${otherMinorByPhone.fullName.trim()}). Enter an adult guardian’s phone number.`
          });
        }
      }
    }
  });
  return violations;
}
const DOMAIN_RULE_PIPELINE = [
  (ctx) => checkBookerRules(ctx.intent),
  (ctx) => checkAttendeeRules(ctx.intent),
  (ctx) => checkGuardianRules(ctx.intent),
  (ctx) => checkAdmissionRules(ctx.intent, ctx.catalogMap, ctx.todayIsoDate),
  (ctx) => checkExtrasRules(ctx.intent, ctx.catalogMap)
];
function validateBookingRules(ctx) {
  const violations = [];
  for (const rule of DOMAIN_RULE_PIPELINE) {
    violations.push(...rule(ctx));
  }
  return violations;
}
function computeWarnings(intent, catalogMap, stockDemand) {
  const warnings = [];
  const childAllDay = catalogMap.get(PRODUCT_CODES.ALL_DAY_CHILD);
  const childDay = catalogMap.get(PRODUCT_CODES.DAY_PASS_CHILD);
  if (childAllDay && childDay && childAllDay.remainingStock > 0) {
    for (const attendee of intent.attendees) {
      if (classifyAge(attendee.age) === "child" && attendee.passKind === "day_pass" && attendee.days.length * childDay.unitPriceCents > childAllDay.unitPriceCents) {
        const diff = attendee.days.length * childDay.unitPriceCents - childAllDay.unitPriceCents;
        warnings.push({
          code: "CHEAPER_OPTION_AVAILABLE",
          message: `${attendee.fullName.trim()}: All-Day Child Pass ($30 for all 5 days) saves $${(diff / 100).toFixed(2)} compared to ${attendee.days.length} separate Day Passes.`
        });
      }
    }
  }
  const familyPass = catalogMap.get(PRODUCT_CODES.FAMILY_PASS);
  const adultDay = catalogMap.get(PRODUCT_CODES.DAY_PASS_ADULT);
  const childDayProd = catalogMap.get(PRODUCT_CODES.DAY_PASS_CHILD);
  if (familyPass && adultDay && childDayProd) {
    for (const group of intent.familyGroups) {
      const members = intent.attendees.filter((a) => a.familyGroupId === group.id);
      const adults = members.filter((m) => classifyAge(m.age) === "adult").length;
      const children = members.filter((m) => classifyAge(m.age) === "child").length;
      const separatePerDay = adults * adultDay.unitPriceCents + children * childDayProd.unitPriceCents;
      if (separatePerDay < familyPass.unitPriceCents) {
        warnings.push({
          code: "CHEAPER_OPTION_AVAILABLE",
          message: `Separate Day Passes (${formatUSD(separatePerDay)}/day) cost less than a Family Pass (${formatUSD(familyPass.unitPriceCents)}/day) for ${adults} adult(s) and ${children} child(ren).`
        });
      }
    }
  }
  for (const [code, qty] of stockDemand.entries()) {
    const product = catalogMap.get(code);
    if (product && qty > 0 && product.remainingStock > 0 && product.remainingStock <= 5) {
      warnings.push({
        code: "LOW_STOCK",
        message: `Hurry — only ${product.remainingStock} ${product.name} spot(s) left!`
      });
    }
  }
  const seenNames = /* @__PURE__ */ new Set();
  const warnedNames = /* @__PURE__ */ new Set();
  for (const attendee of intent.attendees) {
    const norm = attendee.fullName.trim().toLowerCase();
    if (norm && seenNames.has(norm) && !warnedNames.has(norm)) {
      warnedNames.add(norm);
      warnings.push({
        code: "DUPLICATE_ATTENDEE_NAME",
        message: `Multiple attendees share the name "${attendee.fullName.trim()}". Please double-check this is intentional.`
      });
    }
    seenNames.add(norm);
  }
  return warnings;
}
function calculateBookingQuote(params) {
  const catalogMap = buildCatalogMap(params.products);
  const ruleViolations = validateBookingRules({
    intent: params.intent,
    catalogMap,
    todayIsoDate: params.todayIsoDate
  });
  if (ruleViolations.length > 0) {
    return { ok: false, violations: ruleViolations };
  }
  const expanded = expandAndPriceItems(params.intent, catalogMap);
  if (expanded.stockViolations.length > 0) {
    return { ok: false, violations: expanded.stockViolations };
  }
  const promosByCode = new Map(params.promos.map((p) => [p.code.toUpperCase(), p]));
  const promo = evaluatePromoCode({
    rawCode: params.intent.promoCode,
    promosByCode,
    lines: expanded.lines,
    subtotalCents: expanded.subtotalCents,
    nowIso: params.nowIso,
    priorRedemption: params.priorPromoRedemption
  });
  if (params.strictPromo && promo.status === "rejected") {
    return {
      ok: false,
      violations: [
        {
          code: promo.rejectionCode,
          path: "promoCode",
          message: promo.message
        }
      ]
    };
  }
  const discountCents = promo.discountCents;
  const totalCents = subtractCentsClamped(expanded.subtotalCents, discountCents);
  const warnings = computeWarnings(params.intent, catalogMap, expanded.stockDemand);
  return {
    ok: true,
    quote: {
      lines: expanded.lines,
      attendeePasses: expanded.attendeePasses,
      subtotalCents: expanded.subtotalCents,
      discountCents,
      totalCents,
      promo,
      stockDemand: expanded.stockDemand,
      warnings
    }
  };
}
class AppError extends Error {
  statusCode;
  code;
  issues;
  constructor(params) {
    super(params.message);
    this.name = "AppError";
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.issues = params.issues;
  }
}
class BadRequestError extends AppError {
  constructor(message, issues) {
    super({ statusCode: 400, code: "BAD_REQUEST", message, issues });
  }
}
class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super({ statusCode: 401, code: "UNAUTHORIZED", message });
  }
}
class PaymentDeclinedError extends AppError {
  constructor(message = "Payment was declined by the simulated issuer. You have not been charged.") {
    super({ statusCode: 402, code: "PAYMENT_DECLINED", message });
  }
}
class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super({ statusCode: 404, code: "NOT_FOUND", message });
  }
}
class ConflictError extends AppError {
  constructor(code, message, issues) {
    super({ statusCode: 409, code, message, issues });
  }
}
class GoneError extends AppError {
  constructor(code, message) {
    super({ statusCode: 410, code, message });
  }
}
class RuleViolationError extends AppError {
  constructor(message, issues, code = "RULES_VIOLATED") {
    super({ statusCode: 422, code, message, issues });
  }
}
function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "body",
      code: "INVALID_INPUT",
      message: issue.message
    }));
    throw new BadRequestError("Invalid request payload.", issues);
  }
  return parsed.data;
}
function formatDateInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "11";
  const day = parts.find((p) => p.type === "day")?.value ?? "26";
  return `${year}-${month}-${day}`;
}
function createClock(fixedNow) {
  const resolveDate = () => {
    const override = process.env.BOOKING_CLOCK_OVERRIDE?.trim();
    if (override) {
      const parsed = new Date(override);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return /* @__PURE__ */ new Date();
  };
  return {
    now: resolveDate,
    nowIso: () => resolveDate().toISOString(),
    todayFestivalIsoDate: () => formatDateInTimezone(resolveDate(), EVENT_METADATA.timezone)
  };
}
const CROCKFORD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const idx = (bytes[i] ?? 0) % CROCKFORD_ALPHABET.length;
    out += CROCKFORD_ALPHABET[idx];
  }
  return out;
}
function generateBookingReference() {
  return `SU26-${randomCode(6)}`;
}
function generatePassCode() {
  return `PASS-${randomCode(6)}`;
}
function generateInvoiceNumber() {
  return `INV-2026-${randomCode(6)}`;
}
function generateSimulatedMessageId() {
  return `sim_msg_${crypto.randomBytes(8).toString("hex")}`;
}
function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}
function generateSixDigitOtp() {
  return String(crypto.randomInt(1e5, 1e6));
}
function sha256Hex(value) {
  const secret = process.env.SESSION_SECRET?.trim() || "sharad-utsav-default-dev-secret";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
function hashRequestPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
async function generateBoardingPassesPdf(booking, passes) {
  const qrBuffers = await Promise.all(
    passes.map(
      (pass) => QRCode.toBuffer(
        JSON.stringify({
          ref: booking.reference,
          pass: pass.passCode,
          holder: pass.fullName
        }),
        { width: 130, margin: 1, color: { dark: "#291900", light: "#FDF3E4" } }
      )
    )
  );
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [680, 290],
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: `Sharad Utsav 2026 Festival Passes - ${booking.reference}`,
        Author: EVENT_METADATA.venue
      }
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    passes.forEach((pass, idx) => {
      doc.addPage({ size: [680, 290], margin: 0 });
      doc.rect(0, 0, 680, 290).fill("#2C2C2C");
      doc.roundedRect(16, 16, 648, 258, 12).fill("#FDF3E4");
      doc.save();
      doc.roundedRect(16, 16, 648, 258, 12).clip();
      doc.rect(16, 16, 648, 54).fill("#291900");
      doc.moveTo(16, 70).lineTo(664, 70).lineWidth(2).strokeColor("#C99B24").stroke();
      doc.restore();
      doc.roundedRect(16, 16, 648, 258, 12).lineWidth(1).strokeColor("#BC9226").stroke();
      doc.fillColor("#FDF3E4").font("Times-Bold").fontSize(21).text("SHARAD UTSAV 2026", 32, 34, {
        width: 424,
        characterSpacing: 0.5,
        lineBreak: false
      });
      doc.fillColor("#D1AC3E").font("Helvetica-Bold").fontSize(8).text("BOOKING REF", 492, 26, {
        width: 156,
        align: "center",
        characterSpacing: 0.8,
        lineBreak: false
      });
      doc.fillColor("#FDF3E4").font("Helvetica-Bold").fontSize(13).text(booking.reference, 492, 41, {
        width: 156,
        align: "center",
        lineBreak: false
      });
      doc.save().dash(5, { space: 4 }).moveTo(476, 28).lineTo(476, 262).lineWidth(1.2).strokeColor("#BC9226").stroke().restore();
      doc.save();
      doc.roundedRect(16, 16, 648, 258, 12).clip();
      doc.circle(476, 16, 10).fillAndStroke("#2C2C2C", "#BC9226");
      doc.circle(476, 274, 10).fillAndStroke("#2C2C2C", "#BC9226");
      doc.restore();
      doc.rect(464, 4, 24, 12).fill("#2C2C2C");
      doc.rect(464, 274, 24, 12).fill("#2C2C2C");
      doc.fillColor("#645743").font("Helvetica-Bold").fontSize(8).text("PASSHOLDER", 32, 86);
      doc.fillColor("#291900").font("Helvetica-Bold").fontSize(15).text(pass.fullName, 32, 97, { width: 250, ellipsis: true });
      doc.fillColor("#645743").font("Helvetica-Bold").fontSize(8).text("PASS CATEGORY", 295, 86);
      doc.fillColor("#291900").font("Helvetica-Bold").fontSize(11).text(`${pass.passLabel} (Age ${pass.age})`, 295, 99, { width: 165, ellipsis: true });
      doc.fillColor("#645743").font("Helvetica-Bold").fontSize(8).text("VALIDITY DATES", 32, 127);
      doc.fillColor("#291900").font("Helvetica-Bold").fontSize(10.5).text(pass.validDatesDisplay, 32, 139, { width: 426 });
      doc.fillColor("#645743").font("Helvetica-Bold").fontSize(8).text("EXTRAS AVAILED BY PASSHOLDER", 32, 163);
      doc.fillColor("#291900").font("Helvetica").fontSize(10).text(pass.extrasSummary.join("  •  "), 32, 175, { width: 426, ellipsis: true });
      if (pass.guardianName && pass.guardianPhone) {
        doc.roundedRect(32, 198, 426, 42, 6).fillAndStroke("#F6E5C4", "#C99B24");
        doc.fillColor("#291900").font("Helvetica-Bold").fontSize(8.5).text("MINOR SAFEGUARD · REGISTERED GUARDIAN", 42, 205);
        doc.fillColor("#291900").font("Helvetica-Bold").fontSize(11).text(`${pass.guardianName}   ·   Tel: ${pass.guardianPhone}`, 42, 219, {
          width: 404,
          ellipsis: true
        });
        doc.fillColor("#645743").font("Helvetica").fontSize(8).text(`Venue: ${EVENT_METADATA.venue}, ${EVENT_METADATA.address}`, 32, 248);
      } else {
        doc.fillColor("#645743").font("Helvetica-Bold").fontSize(8).text("VENUE & GATE INFO", 32, 206);
        doc.fillColor("#291900").font("Helvetica-Bold").fontSize(10.5).text(`${EVENT_METADATA.venue} — ${EVENT_METADATA.address}`, 32, 218, { width: 426 });
        doc.fillColor("#645743").font("Helvetica").fontSize(8.5).text("Gates open 5:00 PM CST daily · Present this pass & photo ID at check-in.", 32, 238);
      }
      const qrBuf = qrBuffers[idx];
      if (qrBuf) {
        doc.image(qrBuf, 513, 86, { width: 114, height: 114 });
      }
      doc.fillColor("#291900").font("Helvetica-Bold").fontSize(11).text(pass.passCode, 492, 207, { width: 156, align: "center" });
      doc.fillColor("#645743").font("Helvetica").fontSize(8.5).text(`Pass ${idx + 1} of ${passes.length}`, 492, 225, { width: 156, align: "center" });
      doc.fillColor("#1E7A29").font("Helvetica-Bold").fontSize(9).text("PAID · CONFIRMED", 492, 243, { width: 156, align: "center" });
    });
    doc.end();
  });
}
function generateInvoicePdf(booking) {
  const invoice = booking.invoice;
  if (!invoice) {
    throw new Error("Cannot generate invoice PDF before booking confirmation.");
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 48,
      info: {
        Title: `Invoice ${invoice.invoiceNumber} - ${booking.reference}`,
        Author: EVENT_METADATA.venue
      }
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.rect(0, 0, 612, 108).fill("#291900");
    doc.moveTo(0, 108).lineTo(612, 108).lineWidth(3).strokeColor("#C99B24").stroke();
    doc.fillColor("#D1AC3E").font("Helvetica-Bold").fontSize(10).text("OFFICIAL TAX-EXEMPT FESTIVAL RECEIPT & INVOICE", 48, 30);
    doc.fillColor("#FDF3E4").font("Times-Bold").fontSize(24).text(EVENT_METADATA.name, 48, 46);
    doc.fillColor("#FDF3E4").font("Helvetica").fontSize(10).text(`${invoice.sellerName} · ${invoice.sellerAddress}`, 48, 76);
    doc.fillColor("#D1AC3E").font("Helvetica-Bold").fontSize(12).text(invoice.invoiceNumber, 380, 38, { width: 184, align: "right" });
    doc.fillColor("#FDF3E4").font("Helvetica").fontSize(10).text(`Ref: ${booking.reference}`, 380, 56, { width: 184, align: "right" }).text(`Issued: ${invoice.issuedAt.slice(0, 10)}`, 380, 72, { width: 184, align: "right" });
    let y = 132;
    doc.fillColor("#645743").font("Helvetica-Bold").fontSize(9).text("BILLED TO", 48, y);
    doc.fillColor("#645743").font("Helvetica-Bold").fontSize(9).text("PAYMENT DETAILS", 330, y);
    y += 14;
    doc.fillColor("#291900").font("Helvetica-Bold").fontSize(11).text(invoice.billedToName, 48, y);
    doc.fillColor("#645743").font("Helvetica").fontSize(10).text(invoice.billedToEmail, 48, y + 15).text(invoice.billedToPhone, 48, y + 30);
    doc.fillColor("#291900").font("Helvetica-Bold").fontSize(10.5).text(invoice.paymentMethodLabel, 330, y);
    doc.fillColor("#1E7A29").font("Helvetica-Bold").fontSize(10).text("Status: PAID (Simulated Gateway)", 330, y + 15);
    doc.fillColor("#645743").font("Helvetica").fontSize(9.5).text(`Nonprofit EIN: ${invoice.sellerEin}`, 330, y + 30);
    y = 212;
    doc.rect(48, y, 516, 24).fill("#FDF3E4");
    doc.fillColor("#291900").font("Helvetica-Bold").fontSize(9.5);
    doc.text("DESCRIPTION", 58, y + 7, { width: 300 });
    doc.text("QTY", 365, y + 7, { width: 45, align: "right" });
    doc.text("UNIT", 420, y + 7, { width: 65, align: "right" });
    doc.text("AMOUNT", 490, y + 7, { width: 64, align: "right" });
    y += 30;
    for (const line of booking.lines) {
      if (y > 660) {
        doc.addPage();
        y = 48;
      }
      doc.fillColor("#291900").font("Helvetica").fontSize(10);
      doc.text(line.label, 58, y, { width: 300 });
      doc.text(String(line.quantity), 365, y, { width: 45, align: "right" });
      doc.text(formatUSD(cents(line.unitPriceCents)), 420, y, { width: 65, align: "right" });
      doc.font("Helvetica-Bold").text(formatUSD(cents(line.lineTotalCents)), 490, y, { width: 64, align: "right" });
      y += 22;
      doc.moveTo(48, y - 4).lineTo(564, y - 4).lineWidth(0.5).strokeColor("#E5DAC7").stroke();
    }
    y += 12;
    doc.fillColor("#645743").font("Helvetica").fontSize(10);
    doc.text("Subtotal", 380, y, { width: 100, align: "right" });
    doc.fillColor("#291900").text(formatUSD(cents(invoice.subtotalCents)), 490, y, { width: 64, align: "right" });
    if (invoice.discountCents > 0) {
      y += 18;
      doc.fillColor("#1E7A29").text(`Promo (${invoice.promoCode ?? "DISCOUNT"})`, 340, y, { width: 140, align: "right" });
      doc.text(`-${formatUSD(cents(invoice.discountCents))}`, 490, y, {
        width: 64,
        align: "right"
      });
    }
    y += 18;
    doc.fillColor("#645743").text("Nonprofit Sales Tax (0%)", 340, y, { width: 140, align: "right" });
    doc.fillColor("#291900").text(formatUSD(cents(invoice.taxCents)), 490, y, { width: 64, align: "right" });
    y += 22;
    doc.rect(340, y - 5, 224, 28).fill("#FDF3E4");
    doc.fillColor("#291900").font("Helvetica-Bold").fontSize(12);
    doc.text("Total Paid (USD)", 350, y + 3, { width: 130, align: "right" });
    doc.text(formatUSD(cents(invoice.totalCents)), 490, y + 3, { width: 64, align: "right" });
    doc.fillColor("#645743").font("Helvetica").fontSize(8.5).text(
      "Note: Payment was processed via the Sharad Utsav 2026 simulated payment gateway for demonstration purposes.",
      48,
      720,
      { width: 516, align: "center" }
    );
    doc.end();
  });
}
const productCategoryEnum = pgEnum("product_category", ["admission", "extra"]);
const ageBandEnum = pgEnum("age_band", ["infant", "child", "adult"]);
const pricingUnitEnum = pgEnum("pricing_unit", [
  "flat",
  "per_person_per_day",
  "per_day",
  "per_unit"
]);
const dayRuleEnum = pgEnum("day_rule", [
  "choose_days",
  "all_days",
  "single_day",
  "specific_days",
  "none"
]);
const promoDiscountTypeEnum = pgEnum("promo_discount_type", [
  "percent",
  "fixed",
  "child_admissions_free"
]);
const bookingModeEnum = pgEnum("booking_mode", ["individual", "group"]);
const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment",
  "confirmed",
  "expired",
  "cancelled"
]);
const passKindEnum = pgEnum("pass_kind", [
  "day_pass",
  "all_day",
  "family_pass",
  "free_infant"
]);
const paymentMethodEnum = pgEnum("payment_method", ["card", "stripe"]);
const paymentStatusEnum = pgEnum("payment_status", ["succeeded", "declined", "cancelled"]);
const contributionCategoryEnum = pgEnum("contribution_category", [
  "charity",
  "seva",
  "event"
]);
const emailStatusEnum = pgEnum("email_status", ["pending", "sent", "failed"]);
const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex("users_email_normalized_idx").on(t.emailNormalized)]
);
pgTable(
  "auth_otps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emailNormalized: text("email_normalized").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index("auth_otps_email_idx").on(t.emailNormalized)]
);
pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex("user_sessions_token_hash_idx").on(t.tokenHash)]
);
pgTable(
  "contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    emailNormalized: text("email_normalized").notNull(),
    title: text("title").notNull(),
    organization: text("organization").notNull(),
    category: contributionCategoryEnum("category").notNull(),
    amountCents: integer("amount_cents"),
    contributedOn: text("contributed_on").notNull(),
    summary: text("summary").notNull(),
    impactBadge: text("impact_badge").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index("contributions_email_idx").on(t.emailNormalized)]
);
const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    venue: text("venue").notNull(),
    address: text("address").notNull(),
    timezone: text("timezone").notNull().default("America/Chicago"),
    currency: text("currency").notNull().default("USD"),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    ageReferenceDate: text("age_reference_date").notNull(),
    holdMinutes: integer("hold_minutes").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex("events_slug_idx").on(t.slug)]
);
const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: productCategoryEnum("category").notNull(),
    ageBand: text("age_band"),
    pricingUnit: pricingUnitEnum("pricing_unit").notNull(),
    dayRule: dayRuleEnum("day_rule").notNull(),
    allowedDates: jsonb("allowed_dates").$type(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    maxAdults: integer("max_adults"),
    maxChildren: integer("max_children"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true)
  },
  (t) => [
    uniqueIndex("products_event_code_idx").on(t.eventId, t.code),
    check("products_price_nonneg", sql`${t.unitPriceCents} >= 0`)
  ]
);
pgTable(
  "inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    total: integer("total").notNull(),
    remaining: integer("remaining").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("inventory_product_idx").on(t.productId),
    check(
      "inventory_remaining_bounds",
      sql`${t.remaining} >= 0 AND ${t.remaining} <= ${t.total}`
    )
  ]
);
const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description").notNull(),
    discountType: promoDiscountTypeEnum("discount_type").notNull(),
    percentBps: integer("percent_bps"),
    amountCents: integer("amount_cents"),
    minSubtotalExclusiveCents: integer("min_subtotal_exclusive_cents"),
    validFromIso: text("valid_from_iso"),
    validUntilIso: text("valid_until_iso"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true)
  },
  (t) => [
    uniqueIndex("promo_codes_event_code_idx").on(t.eventId, t.code),
    check(
      "promo_codes_usage_bounds",
      sql`${t.usedCount} >= 0 AND (${t.maxUses} IS NULL OR ${t.usedCount} <= ${t.maxUses})`
    )
  ]
);
const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull(),
    eventId: uuid("event_id").notNull().references(() => events.id),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    mode: bookingModeEnum("mode").notNull(),
    status: bookingStatusEnum("status").notNull().default("pending_payment"),
    bookerFullName: text("booker_full_name").notNull(),
    bookerEmail: text("booker_email").notNull(),
    bookerEmailNormalized: text("booker_email_normalized").notNull(),
    bookerPhone: text("booker_phone").notNull(),
    bookerAge: smallint("booker_age").notNull(),
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id),
    promoCodeText: text("promo_code_text"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex("bookings_reference_idx").on(t.reference),
    uniqueIndex("bookings_idempotency_idx").on(t.idempotencyKey),
    index("bookings_status_hold_idx").on(t.status, t.holdExpiresAt),
    index("bookings_email_norm_idx").on(t.bookerEmailNormalized),
    check("bookings_booker_adult", sql`${t.bookerAge} >= 18`),
    check(
      "bookings_totals_nonneg",
      sql`${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.totalCents} >= 0`
    )
  ]
);
pgTable(
  "attendees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    passCode: text("pass_code").notNull(),
    isBooker: boolean("is_booker").notNull().default(false),
    selectedCategory: ageBandEnum("selected_category").notNull(),
    ageBand: ageBandEnum("age_band").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    age: smallint("age").notNull(),
    passKind: passKindEnum("pass_kind").notNull(),
    passLabel: text("pass_label").notNull(),
    validDates: jsonb("valid_dates").$type().notNull(),
    validDatesDisplay: text("valid_dates_display").notNull(),
    extrasSummary: jsonb("extras_summary").$type().notNull(),
    guardianName: text("guardian_name"),
    guardianPhone: text("guardian_phone")
  },
  (t) => [
    uniqueIndex("attendees_pass_code_idx").on(t.passCode),
    index("attendees_booking_idx").on(t.bookingId),
    check("attendees_age_range", sql`${t.age} >= 0 AND ${t.age} <= 120`),
    check(
      "attendees_minor_guardian_required",
      sql`${t.age} >= 18 OR (${t.guardianName} IS NOT NULL AND length(trim(${t.guardianName})) >= 2 AND ${t.guardianPhone} IS NOT NULL AND length(trim(${t.guardianPhone})) >= 7 AND lower(regexp_replace(trim(${t.guardianName}), '[[:space:]]+', ' ', 'g')) <> lower(regexp_replace(trim(${t.fullName}), '[[:space:]]+', ' ', 'g')) AND (${t.phone} IS NULL OR regexp_replace(${t.guardianPhone}, '[^0-9]', '', 'g') <> regexp_replace(${t.phone}, '[^0-9]', '', 'g')))`
    )
  ]
);
pgTable(
  "booking_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id),
    productCode: text("product_code").notNull(),
    label: text("label").notNull(),
    eventDate: text("event_date"),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull()
  },
  (t) => [
    index("booking_lines_booking_idx").on(t.bookingId),
    check("booking_lines_qty_pos", sql`${t.quantity} > 0`)
  ]
);
pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    cardLast4: text("card_last4"),
    providerRef: text("provider_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [index("payments_booking_idx").on(t.bookingId)]
);
pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    billedToName: text("billed_to_name").notNull(),
    billedToEmail: text("billed_to_email").notNull(),
    billedToPhone: text("billed_to_phone").notNull(),
    paymentMethodLabel: text("payment_method_label").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull()
  },
  (t) => [
    uniqueIndex("invoices_booking_idx").on(t.bookingId),
    uniqueIndex("invoices_number_idx").on(t.invoiceNumber)
  ]
);
pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email").notNull(),
    subject: text("subject").notNull(),
    htmlBody: text("html_body").notNull(),
    textBody: text("text_body").notNull(),
    attachments: jsonb("attachments").$type().notNull(),
    status: emailStatusEnum("status").notNull().default("sent"),
    simulatedMessageId: text("simulated_message_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex("email_outbox_booking_idx").on(t.bookingId)]
);
dotenv.config({ path: ".env.local" });
dotenv.config();
const { Pool } = pg;
let poolInstance = null;
function hasDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && !url.includes("ep-example"));
}
function normalizeConnectionString(raw) {
  if (raw.includes("sslmode=require") && !raw.includes("uselibpqcompat=")) {
    return raw.replace("sslmode=require", "sslmode=verify-full");
  }
  return raw;
}
function getPool() {
  if (!poolInstance) {
    const rawUrl = process.env.DATABASE_URL?.trim();
    if (!rawUrl) {
      throw new Error("DATABASE_URL environment variable is not configured.");
    }
    const connectionString = normalizeConnectionString(rawUrl);
    poolInstance = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 15e3,
      connectionTimeoutMillis: 1e4
    });
    attachDatabasePool(poolInstance);
  }
  return poolInstance;
}
const DEMO_PROFILE = {
  email: "devotee@radhakrishnatemple.net",
  emailNormalized: "devotee@radhakrishnatemple.net",
  fullName: "Shreejan Mishra",
  phone: "+1 469-795-9130"
};
const SEEDED_CONTRIBUTIONS = [
  {
    title: "Annadanam Community Meal Seva",
    organization: "Radha Krishna Temple · Allen, TX",
    category: "seva",
    amountCents: 10100,
    contributedOn: "2026-10-20",
    summary: "Sponsored freshly prepared sattvic prasad meals served to 250+ visitors during Diwali Mahotsav.",
    impactBadge: "250+ Meals Served"
  },
  {
    title: "Bal-Mukund Youth Education Scholarship Fund",
    organization: "JKYog Charitable Initiatives",
    category: "charity",
    amountCents: 15100,
    contributedOn: "2026-08-26",
    summary: "Supported value-based cultural workshops, books, and learning kits for children during Janmashtami.",
    impactBadge: "Youth Education"
  },
  {
    title: "Health & Wellness Free Yoga Camp Volunteer",
    organization: "Dallas–Fort Worth Community Outreach",
    category: "event",
    amountCents: null,
    contributedOn: "2026-06-21",
    summary: "Contributed 12 volunteer hours coordinating registration, hydration desks, and senior citizen seating.",
    impactBadge: "12 Volunteer Hours"
  }
];
const SCHEMA_DDL = `
DO $$ BEGIN
  CREATE TYPE product_category AS ENUM ('admission', 'extra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE age_band AS ENUM ('infant', 'child', 'adult');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_unit AS ENUM ('flat', 'per_person_per_day', 'per_day', 'per_unit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE day_rule AS ENUM ('choose_days', 'all_days', 'single_day', 'specific_days', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE promo_discount_type AS ENUM ('percent', 'fixed', 'child_admissions_free');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_mode AS ENUM ('individual', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending_payment', 'confirmed', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pass_kind AS ENUM ('day_pass', 'all_day', 'family_pass', 'free_infant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('card', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('succeeded', 'declined', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contribution_category AS ENUM ('charity', 'seva', 'event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_otps_email_idx ON auth_otps (email_normalized);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_normalized TEXT NOT NULL,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  category contribution_category NOT NULL,
  amount_cents INTEGER,
  contributed_on TEXT NOT NULL,
  summary TEXT NOT NULL,
  impact_badge TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributions_email_idx ON contributions (email_normalized);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  currency TEXT NOT NULL DEFAULT 'USD',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  age_reference_date TEXT NOT NULL,
  hold_minutes INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category product_category NOT NULL,
  age_band TEXT,
  pricing_unit pricing_unit NOT NULL,
  day_rule day_rule NOT NULL,
  allowed_dates JSONB,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  max_adults INTEGER,
  max_children INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_remaining_bounds CHECK (remaining >= 0 AND remaining <= total)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_type promo_discount_type NOT NULL,
  percent_bps INTEGER,
  amount_cents INTEGER,
  min_subtotal_exclusive_cents INTEGER,
  valid_from_iso TEXT,
  valid_until_iso TEXT,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (event_id, code),
  CONSTRAINT promo_codes_usage_bounds CHECK (used_count >= 0 AND (max_uses IS NULL OR used_count <= max_uses))
);
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_subtotal_exclusive_cents INTEGER;

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  event_id UUID NOT NULL REFERENCES events(id),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mode booking_mode NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending_payment',
  booker_full_name TEXT NOT NULL,
  booker_email TEXT NOT NULL,
  booker_email_normalized TEXT NOT NULL,
  booker_phone TEXT NOT NULL,
  booker_age SMALLINT NOT NULL CHECK (booker_age >= 18),
  promo_code_id UUID REFERENCES promo_codes(id),
  promo_code_text TEXT,
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method payment_method NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  hold_expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_status_hold_idx ON bookings (status, hold_expires_at);
CREATE INDEX IF NOT EXISTS bookings_email_norm_idx ON bookings (booker_email_normalized);

CREATE TABLE IF NOT EXISTS attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  pass_code TEXT NOT NULL UNIQUE,
  is_booker BOOLEAN NOT NULL DEFAULT false,
  selected_category age_band NOT NULL,
  age_band age_band NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  age SMALLINT NOT NULL CHECK (age >= 0 AND age <= 120),
  pass_kind pass_kind NOT NULL,
  pass_label TEXT NOT NULL,
  valid_dates JSONB NOT NULL,
  valid_dates_display TEXT NOT NULL,
  extras_summary JSONB NOT NULL,
  guardian_name TEXT,
  guardian_phone TEXT,
  CONSTRAINT attendees_minor_guardian_required CHECK (
    age >= 18 OR (
      guardian_name IS NOT NULL AND length(trim(guardian_name)) >= 2 AND
      guardian_phone IS NOT NULL AND length(trim(guardian_phone)) >= 7 AND
      lower(regexp_replace(trim(guardian_name), '[[:space:]]+', ' ', 'g')) <> lower(regexp_replace(trim(full_name), '[[:space:]]+', ' ', 'g')) AND
      (phone IS NULL OR regexp_replace(guardian_phone, '[^0-9]', '', 'g') <> regexp_replace(phone, '[^0-9]', '', 'g'))
    )
  )
);
CREATE INDEX IF NOT EXISTS attendees_booking_idx ON attendees (booking_id);

CREATE TABLE IF NOT EXISTS booking_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_code TEXT NOT NULL,
  label TEXT NOT NULL,
  event_date TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_lines_booking_idx ON booking_lines (booking_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  status payment_status NOT NULL,
  amount_cents INTEGER NOT NULL,
  card_last4 TEXT,
  provider_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  billed_to_name TEXT NOT NULL,
  billed_to_email TEXT NOT NULL,
  billed_to_phone TEXT NOT NULL,
  payment_method_label TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  attachments JSONB NOT NULL,
  status email_status NOT NULL DEFAULT 'sent',
  simulated_message_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
let bootstrapPromise = null;
async function runSchemaMigrations(pool) {
  await pool.query(SCHEMA_DDL);
}
async function seedDatabase(pool, options = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eventRes = await client.query(
      `INSERT INTO events (slug, name, venue, address, timezone, currency, starts_on, ends_on, age_reference_date, hold_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         venue = EXCLUDED.venue,
         address = EXCLUDED.address,
         starts_on = EXCLUDED.starts_on,
         ends_on = EXCLUDED.ends_on,
         age_reference_date = EXCLUDED.age_reference_date,
         hold_minutes = EXCLUDED.hold_minutes
       RETURNING id`,
      [
        EVENT_METADATA.slug,
        EVENT_METADATA.name,
        EVENT_METADATA.venue,
        EVENT_METADATA.address,
        EVENT_METADATA.timezone,
        EVENT_METADATA.currency,
        EVENT_METADATA.startsOn,
        EVENT_METADATA.endsOn,
        EVENT_METADATA.ageReferenceDate,
        EVENT_METADATA.holdMinutes
      ]
    );
    const eventId = eventRes.rows[0].id;
    for (const item of DEFAULT_CATALOG) {
      const prodRes = await client.query(
        `INSERT INTO products (
           event_id, code, name, description, category, age_band, pricing_unit,
           day_rule, allowed_dates, unit_price_cents, max_adults, max_children, sort_order, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, true)
         ON CONFLICT (event_id, code) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           unit_price_cents = EXCLUDED.unit_price_cents,
           allowed_dates = EXCLUDED.allowed_dates,
           sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [
          eventId,
          item.code,
          item.name,
          item.description,
          item.category,
          item.ageBand,
          item.pricingUnit,
          item.dayRule,
          item.allowedDates ? JSON.stringify(item.allowedDates) : null,
          item.unitPriceCents,
          item.maxAdults,
          item.maxChildren,
          item.sortOrder
        ]
      );
      const productId = prodRes.rows[0].id;
      if (options.resetStock) {
        await client.query(
          `INSERT INTO inventory (product_id, total, remaining, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (product_id) DO UPDATE SET
             total = EXCLUDED.total,
             remaining = EXCLUDED.remaining,
             updated_at = now()`,
          [productId, item.totalStock, item.remainingStock]
        );
      } else {
        await client.query(
          `INSERT INTO inventory (product_id, total, remaining)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id) DO NOTHING`,
          [productId, item.totalStock, item.remainingStock]
        );
      }
    }
    for (const promo of DEFAULT_PROMOS) {
      if (options.resetStock) {
        await client.query(
          `INSERT INTO promo_codes (
             event_id, code, description, discount_type, percent_bps, amount_cents,
             min_subtotal_exclusive_cents, valid_from_iso, valid_until_iso, max_uses, used_count, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (event_id, code) DO UPDATE SET
             description = EXCLUDED.description,
             min_subtotal_exclusive_cents = EXCLUDED.min_subtotal_exclusive_cents,
             used_count = EXCLUDED.used_count,
             max_uses = EXCLUDED.max_uses,
             valid_until_iso = EXCLUDED.valid_until_iso,
             is_active = EXCLUDED.is_active`,
          [
            eventId,
            promo.code,
            promo.description,
            promo.discountType,
            promo.percentBps,
            promo.amountCents,
            promo.minSubtotalExclusiveCents,
            promo.validFromIso,
            promo.validUntilIso,
            promo.maxUses,
            promo.usedCount,
            promo.isActive
          ]
        );
      } else {
        await client.query(
          `INSERT INTO promo_codes (
             event_id, code, description, discount_type, percent_bps, amount_cents,
             min_subtotal_exclusive_cents, valid_from_iso, valid_until_iso, max_uses, used_count, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (event_id, code) DO UPDATE SET
             description = EXCLUDED.description,
             min_subtotal_exclusive_cents = EXCLUDED.min_subtotal_exclusive_cents`,
          [
            eventId,
            promo.code,
            promo.description,
            promo.discountType,
            promo.percentBps,
            promo.amountCents,
            promo.minSubtotalExclusiveCents,
            promo.validFromIso,
            promo.validUntilIso,
            promo.maxUses,
            promo.usedCount,
            promo.isActive
          ]
        );
      }
    }
    const userRes = await client.query(
      `INSERT INTO users (email, email_normalized, full_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email_normalized) DO UPDATE SET
         full_name = EXCLUDED.full_name
       RETURNING id`,
      [
        DEMO_PROFILE.email,
        DEMO_PROFILE.emailNormalized,
        DEMO_PROFILE.fullName,
        DEMO_PROFILE.phone
      ]
    );
    const demoUserId = userRes.rows[0].id;
    const existingContribs = await client.query(
      `SELECT COUNT(*)::text AS count FROM contributions WHERE email_normalized = $1`,
      [DEMO_PROFILE.emailNormalized]
    );
    if (Number(existingContribs.rows[0]?.count ?? "0") === 0) {
      for (const c of SEEDED_CONTRIBUTIONS) {
        await client.query(
          `INSERT INTO contributions (
             user_id, email_normalized, title, organization, category,
             amount_cents, contributed_on, summary, impact_badge
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            demoUserId,
            DEMO_PROFILE.emailNormalized,
            c.title,
            c.organization,
            c.category,
            c.amountCents,
            c.contributedOn,
            c.summary,
            c.impactBadge
          ]
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
function ensureBootstrapped(pool) {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await runSchemaMigrations(pool);
      await seedDatabase(pool, { resetStock: false });
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}
const SIMULATED_FROM_EMAIL = "Sharad Utsav Desk <bookings@sharadutsav.radhakrishnatemple.org>";
function escapeHtml(raw) {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderConfirmationEmail(input) {
  const subject = `Booking Confirmed · ${EVENT_METADATA.name} (${input.reference})`;
  const passesUrl = `/api/bookings/${input.bookingId}/passes.pdf`;
  const invoiceUrl = `/api/bookings/${input.bookingId}/invoice.pdf`;
  const passCardsHtml = input.passes.map((p) => {
    const guardianRow = p.guardianName && p.guardianPhone ? `<div style="margin-top:8px;padding:8px 10px;background:#F5E6C8;border-left:3px solid #BC9226;border-radius:4px;font-size:13px;color:#291900;">
               <strong>Guardian (Minor Safeguard):</strong> ${escapeHtml(p.guardianName)} · ${escapeHtml(p.guardianPhone)}
             </div>` : "";
    return `
        <div style="background:#FDF3E4;border:1px solid #BC9226;border-radius:10px;padding:14px 16px;margin-bottom:12px;color:#291900;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px dashed #BC9226;padding-bottom:8px;margin-bottom:8px;">
            <strong style="font-size:16px;">${escapeHtml(p.fullName)}</strong>
            <span style="font-size:12px;background:#2C2C2C;color:#FDF3E4;padding:2px 8px;border-radius:999px;">${escapeHtml(p.passCode)}</span>
          </div>
          <div style="font-size:13px;color:#645743;line-height:1.5;">
            <div><strong style="color:#291900;">Pass:</strong> ${escapeHtml(p.passLabel)} (Age ${p.age})</div>
            <div><strong style="color:#291900;">Valid Dates:</strong> ${escapeHtml(p.validDatesDisplay)}</div>
            <div><strong style="color:#291900;">Extras:</strong> ${escapeHtml(p.extrasSummary.join(" · "))}</div>
          </div>
          ${guardianRow}
        </div>
      `;
  }).join("");
  const lineRowsHtml = input.lines.map(
    (line) => `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#645743;">${escapeHtml(line.label)}</td>
        <td style="padding:6px 0;font-size:13px;color:#291900;text-align:right;font-weight:600;">${formatUSD(cents(line.lineTotalCents))}</td>
      </tr>`
  ).join("");
  const discountRowHtml = input.discountCents > 0 ? `<tr>
           <td style="padding:6px 0;font-size:13px;color:#1E7A29;">Promo Discount (${escapeHtml(input.promoCode ?? "APPLIED")})</td>
           <td style="padding:6px 0;font-size:13px;color:#1E7A29;text-align:right;font-weight:600;">-${formatUSD(cents(input.discountCents))}</td>
         </tr>` : "";
  const htmlBody = `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;background:#2C2C2C;color:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #BC9226;">
      <div style="background:#291900;padding:24px;border-bottom:2px solid #C99B24;">
        <div style="color:#D1AC3E;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(EVENT_METADATA.venue)}</div>
        <h1 style="margin:6px 0 4px;font-family:Georgia,serif;font-size:26px;color:#FDF3E4;">${escapeHtml(EVENT_METADATA.name)}</h1>
        <div style="font-size:14px;color:#FDF3E4;">Thu 10 Dec 2026 – Mon 14 Dec 2026 · Booking Reference: <strong style="color:#D1AC3E;">${escapeHtml(input.reference)}</strong></div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
          Namaste <strong>${escapeHtml(input.bookerName)}</strong>, your festival passes are confirmed! Your festival passes and itemized invoice (${escapeHtml(input.invoiceNumber)}) are attached below.
        </p>
        <h2 style="font-family:Georgia,serif;font-size:18px;color:#D1AC3E;margin:20px 0 10px;">Issued Festival Passes (${input.passes.length})</h2>
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
  const textPasses = input.passes.map((p) => {
    const g = p.guardianName && p.guardianPhone ? ` | Guardian: ${p.guardianName} (${p.guardianPhone})` : "";
    return `- ${p.fullName} [${p.passCode}]: ${p.passLabel} | Valid: ${p.validDatesDisplay} | Extras: ${p.extrasSummary.join(", ")}${g}`;
  }).join("\n");
  const textBody = [
    `${EVENT_METADATA.name} — Booking Confirmed (${input.reference})`,
    `Venue: ${EVENT_METADATA.venue}, ${EVENT_METADATA.address}`,
    `Invoice: ${input.invoiceNumber}`,
    "",
    "Passes:",
    textPasses,
    "",
    `Subtotal: ${formatUSD(cents(input.subtotalCents))}`,
    `Discount: -${formatUSD(cents(input.discountCents))}`,
    `Total Paid: ${formatUSD(cents(input.totalCents))}`
  ].join("\n");
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
        contentType: "application/pdf"
      },
      {
        filename: `Invoice-${input.invoiceNumber}.pdf`,
        url: invoiceUrl,
        contentType: "application/pdf"
      }
    ]
  };
}
const SELLER_EIN$1 = "47-1928374 (501(c)(3) Tax-Exempt)";
class InMemoryTransactionalStore {
  products = /* @__PURE__ */ new Map();
  promos = /* @__PURE__ */ new Map();
  bookings = /* @__PURE__ */ new Map();
  bookingIdByIdempotency = /* @__PURE__ */ new Map();
  usersByEmail = /* @__PURE__ */ new Map();
  usersById = /* @__PURE__ */ new Map();
  sessions = /* @__PURE__ */ new Map();
  otps = /* @__PURE__ */ new Map();
  contributionsByEmail = /* @__PURE__ */ new Map();
  mutex = Promise.resolve();
  constructor() {
    this.seedDefaults();
  }
  seedDefaults() {
    this.products.clear();
    for (const item of DEFAULT_CATALOG) {
      this.products.set(item.code, { ...item });
    }
    this.promos.clear();
    for (const p of DEFAULT_PROMOS) {
      this.promos.set(p.code, { ...p });
    }
    const demoUser = {
      id: crypto.randomUUID(),
      email: DEMO_PROFILE.email,
      fullName: DEMO_PROFILE.fullName,
      phone: DEMO_PROFILE.phone,
      createdAt: (/* @__PURE__ */ new Date("2026-01-15T12:00:00Z")).toISOString()
    };
    this.usersByEmail.set(DEMO_PROFILE.emailNormalized, demoUser);
    this.usersById.set(demoUser.id, demoUser);
    this.seedContributionsForEmail(DEMO_PROFILE.emailNormalized);
  }
  seedContributionsForEmail(emailNormalized) {
    if (this.contributionsByEmail.has(emailNormalized)) return;
    this.contributionsByEmail.set(
      emailNormalized,
      SEEDED_CONTRIBUTIONS.map((c) => ({
        id: crypto.randomUUID(),
        title: c.title,
        organization: c.organization,
        category: c.category,
        amountCents: c.amountCents,
        contributedOn: c.contributedOn,
        summary: c.summary,
        impactBadge: c.impactBadge
      }))
    );
  }
  async withLock(fn) {
    const prev = this.mutex;
    let release;
    this.mutex = new Promise((res) => {
      release = res;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  releaseExpiredInternal(now) {
    let count = 0;
    for (const rec of this.bookings.values()) {
      if (rec.status === "pending_payment" && rec.holdExpiresAt <= now) {
        rec.status = "expired";
        count += 1;
        for (const [code, qty] of rec.stockDemand.entries()) {
          const cur = this.products.get(code);
          if (cur) {
            this.products.set(code, {
              ...cur,
              remainingStock: Math.min(cur.totalStock, cur.remainingStock + qty)
            });
          }
        }
        if (rec.promoCode) {
          const p = this.promos.get(rec.promoCode);
          if (p) {
            this.promos.set(rec.promoCode, {
              ...p,
              usedCount: Math.max(0, p.usedCount - 1)
            });
          }
        }
      }
    }
    return count;
  }
  async getCatalogAndPromos() {
    return this.withLock(async () => {
      return {
        products: [...this.products.values()].sort((a, b) => a.sortOrder - b.sortOrder),
        promos: [...this.promos.values()]
      };
    });
  }
  async releaseExpiredHolds(now) {
    return this.withLock(async () => this.releaseExpiredInternal(now));
  }
  lookupPriorPromoRedemptionInternal(participants, now) {
    if (participants.length === 0) return null;
    for (const rec of this.bookings.values()) {
      if (!rec.promoCode) continue;
      if (rec.status !== "confirmed" && !(rec.status === "pending_payment" && rec.holdExpiresAt > now)) {
        continue;
      }
      for (const participant of participants) {
        if (rec.promoParticipantKeys.has(participant.key)) {
          return {
            participantLabel: participant.label,
            bookingReference: rec.reference,
            promoCode: rec.promoCode
          };
        }
      }
    }
    return null;
  }
  async findPriorPromoRedemption(participants, now) {
    return this.withLock(async () => {
      this.releaseExpiredInternal(now);
      return this.lookupPriorPromoRedemptionInternal(participants, now);
    });
  }
  async createBookingHold(input) {
    return this.withLock(async () => {
      const existingId = this.bookingIdByIdempotency.get(input.idempotencyKey);
      if (existingId) {
        const existing = this.bookings.get(existingId);
        if (existing) {
          if (existing.requestHash !== input.requestHash) {
            throw new RuleViolationError(
              "Idempotency-Key has already been used with a different booking payload.",
              [
                {
                  path: "idempotencyKey",
                  code: "IDEMPOTENCY_KEY_REUSED",
                  message: "Start a fresh checkout attempt for modified booking details."
                }
              ],
              "IDEMPOTENCY_KEY_REUSED"
            );
          }
          if (existing.status === "pending_payment" || existing.status === "confirmed") {
            return {
              bookingId: existing.bookingId,
              reference: existing.reference,
              status: existing.status,
              currency: "USD",
              subtotalCents: existing.subtotalCents,
              discountCents: existing.discountCents,
              totalCents: existing.totalCents,
              holdExpiresAt: existing.holdExpiresAt.toISOString(),
              paymentMethod: existing.paymentMethod,
              paymentUrl: existing.status === "confirmed" ? null : `/pay/${existing.bookingId}?method=${existing.paymentMethod}`
            };
          }
        }
      }
      this.releaseExpiredInternal(input.now);
      for (const pass of input.quote.attendeePasses) {
        const incomingKey = computeAttendeeIdentityKey({
          category: pass.ageBand,
          fullName: pass.fullName,
          phone: pass.phone,
          guardianPhone: pass.guardian?.phone ?? null
        });
        if (!incomingKey) continue;
        for (const existingRec of this.bookings.values()) {
          if (existingRec.status !== "confirmed" && existingRec.status !== "pending_payment") {
            continue;
          }
          for (const holder of existingRec.attendeeIdentities) {
            if (holder.identityKey !== incomingKey) continue;
            const overlap = pass.validDates.filter((d) => holder.validDates.includes(d));
            if (overlap.length > 0) {
              throw new ConflictError(
                "DUPLICATE_PASS_HOLDER",
                `${pass.fullName} already holds an active or confirmed pass for ${formatDatesDisplay(overlap)} (Ref ${existingRec.reference}).`,
                [
                  {
                    path: "attendees",
                    code: "DUPLICATE_ATTENDEE",
                    message: `${pass.fullName} already holds a pass for ${formatDatesDisplay(overlap)}.`
                  }
                ]
              );
            }
          }
        }
      }
      for (const [code, qty] of input.quote.stockDemand.entries()) {
        if (qty <= 0) continue;
        const prod = this.products.get(code);
        if (!prod || prod.remainingStock < qty) {
          const rem = prod?.remainingStock ?? 0;
          const name = prod?.name ?? code;
          throw new ConflictError(
            "INSUFFICIENT_STOCK",
            rem <= 0 ? `${name} just sold out.` : `Only ${rem} ${name} remaining — someone else just booked the remaining spots.`,
            [
              {
                path: `stock.${code}`,
                code: rem <= 0 ? "PRODUCT_SOLD_OUT" : "INSUFFICIENT_STOCK",
                message: `Available: ${rem}, requested: ${qty}.`
              }
            ]
          );
        }
      }
      const currentPromoParticipants = collectPromoParticipants({
        booker: input.booker,
        attendees: input.quote.attendeePasses.map((p) => ({
          category: p.ageBand,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone,
          guardianPhone: p.guardian?.phone ?? null
        }))
      });
      let appliedPromoCode = null;
      if (input.quote.promo.status === "applied") {
        const priorRedemption = this.lookupPriorPromoRedemptionInternal(
          currentPromoParticipants,
          input.now
        );
        if (priorRedemption) {
          throw new ConflictError(
            "PROMO_ALREADY_USED",
            `Coupon limit reached: ${priorRedemption.participantLabel} already benefited from promo code ${priorRedemption.promoCode} on booking ${priorRedemption.bookingReference}. Coupons are limited to 1 per booker and attendee.`,
            [
              {
                path: "promoCode",
                code: "PROMO_ALREADY_USED",
                message: `${priorRedemption.participantLabel} already used promo code ${priorRedemption.promoCode} on booking ${priorRedemption.bookingReference}.`
              }
            ]
          );
        }
        const promo = this.promos.get(input.quote.promo.code);
        if (!promo || !promo.isActive || promo.maxUses !== null && promo.usedCount >= promo.maxUses || promo.validUntilIso !== null && input.now.toISOString() > promo.validUntilIso) {
          throw new ConflictError(
            "PROMO_EXHAUSTED",
            `Promo code "${input.quote.promo.code}" is no longer available.`
          );
        }
        this.promos.set(promo.code, { ...promo, usedCount: promo.usedCount + 1 });
        appliedPromoCode = promo.code;
      }
      for (const [code, qty] of input.quote.stockDemand.entries()) {
        if (qty <= 0) continue;
        const prod = this.products.get(code);
        this.products.set(code, { ...prod, remainingStock: prod.remainingStock - qty });
      }
      const bookingId = crypto.randomUUID();
      const reference = generateBookingReference();
      const autoConfirm = input.quote.totalCents === 0;
      const status = autoConfirm ? "confirmed" : "pending_payment";
      const holdExpiresAt = new Date(
        input.now.getTime() + EVENT_METADATA.holdMinutes * 60 * 1e3
      );
      const passes = await Promise.all(
        input.quote.attendeePasses.map(async (p) => {
          const passCode = generatePassCode();
          return {
            attendeeId: crypto.randomUUID(),
            passCode,
            fullName: p.fullName,
            age: p.age,
            ageBand: p.ageBand,
            selectedCategory: p.ageBand,
            passKind: p.passKind,
            passLabel: p.passLabel,
            validDates: [...p.validDates],
            validDatesDisplay: p.validDatesDisplay,
            extrasSummary: [...p.extrasSummary],
            guardianName: p.guardian?.name ?? null,
            guardianPhone: p.guardian?.phone ?? null,
            qrDataUrl: await QRCode.toDataURL(
              JSON.stringify({ ref: reference, pass: passCode, holder: p.fullName }),
              { width: 160, margin: 1, color: { dark: "#291900", light: "#FDF3E4" } }
            )
          };
        })
      );
      const lines = input.quote.lines.map((l) => ({
        productCode: l.productCode,
        label: l.label,
        attendeeClientId: l.attendeeClientId,
        familyGroupId: l.familyGroupId,
        eventDate: l.eventDate,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents
      }));
      let invoice = null;
      let simulatedEmail = null;
      if (autoConfirm) {
        const invoiceNumber = generateInvoiceNumber();
        invoice = {
          invoiceNumber,
          issuedAt: input.now.toISOString(),
          sellerName: EVENT_METADATA.venue,
          sellerAddress: EVENT_METADATA.address,
          sellerEin: SELLER_EIN$1,
          billedToName: input.booker.fullName.trim(),
          billedToEmail: input.booker.email.trim(),
          billedToPhone: input.booker.phone.trim(),
          paymentMethodLabel: "Complimentary ($0 Total after Promo)",
          subtotalCents: input.quote.subtotalCents,
          discountCents: input.quote.discountCents,
          taxCents: 0,
          totalCents: 0,
          promoCode: appliedPromoCode
        };
        const rendered = renderConfirmationEmail({
          bookingId,
          reference,
          bookerName: input.booker.fullName.trim(),
          bookerEmail: input.booker.email.trim(),
          invoiceNumber,
          subtotalCents: input.quote.subtotalCents,
          discountCents: input.quote.discountCents,
          totalCents: 0,
          promoCode: appliedPromoCode,
          passes,
          lines
        });
        simulatedEmail = {
          bookingId,
          toEmail: rendered.toEmail,
          fromEmail: rendered.fromEmail,
          subject: rendered.subject,
          sentAt: input.now.toISOString(),
          simulatedMessageId: generateSimulatedMessageId(),
          htmlBody: rendered.htmlBody,
          attachments: rendered.attachments
        };
      }
      const record = {
        bookingId,
        reference,
        userId: input.userId,
        mode: input.mode,
        status,
        booker: {
          fullName: input.booker.fullName.trim(),
          email: input.booker.email.trim(),
          emailNormalized: normalizeEmail(input.booker.email),
          phone: input.booker.phone.trim(),
          age: input.booker.age
        },
        paymentMethod: input.paymentMethod,
        subtotalCents: input.quote.subtotalCents,
        discountCents: input.quote.discountCents,
        totalCents: input.quote.totalCents,
        promoCode: appliedPromoCode,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        holdExpiresAt,
        createdAt: input.now,
        confirmedAt: autoConfirm ? input.now : null,
        stockDemand: new Map(input.quote.stockDemand),
        attendeeIdentities: input.quote.attendeePasses.map((p) => {
          const identityKey = computeAttendeeIdentityKey({
            category: p.ageBand,
            fullName: p.fullName,
            phone: p.phone,
            guardianPhone: p.guardian?.phone ?? null
          });
          return identityKey ? { fullName: p.fullName, identityKey, validDates: [...p.validDates] } : null;
        }).filter((item) => item !== null),
        promoParticipantKeys: new Set(currentPromoParticipants.map((p) => p.key)),
        lines,
        passes,
        invoice,
        simulatedEmail
      };
      this.bookings.set(bookingId, record);
      this.bookingIdByIdempotency.set(input.idempotencyKey, bookingId);
      return {
        bookingId,
        reference,
        status,
        currency: "USD",
        subtotalCents: record.subtotalCents,
        discountCents: record.discountCents,
        totalCents: record.totalCents,
        holdExpiresAt: holdExpiresAt.toISOString(),
        paymentMethod: input.paymentMethod,
        paymentUrl: autoConfirm ? null : `/pay/${bookingId}?method=${input.paymentMethod}`
      };
    });
  }
  async processSimulatedPayment(input) {
    return this.withLock(async () => {
      const rec = this.bookings.get(input.bookingId);
      if (!rec) {
        throw new NotFoundError("Booking not found.");
      }
      if (rec.status === "confirmed") {
        return { bookingId: rec.bookingId, reference: rec.reference, status: "confirmed" };
      }
      if (rec.status === "cancelled") {
        throw new GoneError("BOOKING_CANCELLED", "This booking was cancelled.");
      }
      if (rec.status === "expired" || rec.holdExpiresAt <= input.now) {
        this.releaseExpiredInternal(input.now);
        throw new GoneError(
          "HOLD_EXPIRED",
          "Your 10-minute reservation hold expired. Please return to the booking form and confirm again."
        );
      }
      if (input.outcome === "decline") {
        throw new PaymentDeclinedError();
      }
      if (input.outcome === "cancel") {
        rec.status = "cancelled";
        for (const [code, qty] of rec.stockDemand.entries()) {
          const cur = this.products.get(code);
          if (cur) {
            this.products.set(code, {
              ...cur,
              remainingStock: Math.min(cur.totalStock, cur.remainingStock + qty)
            });
          }
        }
        if (rec.promoCode) {
          const p = this.promos.get(rec.promoCode);
          if (p) {
            this.promos.set(rec.promoCode, {
              ...p,
              usedCount: Math.max(0, p.usedCount - 1)
            });
          }
        }
        return { bookingId: rec.bookingId, reference: rec.reference, status: "cancelled" };
      }
      rec.status = "confirmed";
      rec.paymentMethod = input.method;
      rec.confirmedAt = input.now;
      const methodLabel = input.method === "stripe" ? `Stripe Simulated Checkout (•••• ${input.cardLast4 ?? "4242"})` : `Credit Card Simulated (•••• ${input.cardLast4 ?? "4242"})`;
      const invoiceNumber = generateInvoiceNumber();
      rec.invoice = {
        invoiceNumber,
        issuedAt: input.now.toISOString(),
        sellerName: EVENT_METADATA.venue,
        sellerAddress: EVENT_METADATA.address,
        sellerEin: SELLER_EIN$1,
        billedToName: rec.booker.fullName,
        billedToEmail: rec.booker.email,
        billedToPhone: rec.booker.phone,
        paymentMethodLabel: methodLabel,
        subtotalCents: rec.subtotalCents,
        discountCents: rec.discountCents,
        taxCents: 0,
        totalCents: rec.totalCents,
        promoCode: rec.promoCode
      };
      const rendered = renderConfirmationEmail({
        bookingId: rec.bookingId,
        reference: rec.reference,
        bookerName: rec.booker.fullName,
        bookerEmail: rec.booker.email,
        invoiceNumber,
        subtotalCents: rec.subtotalCents,
        discountCents: rec.discountCents,
        totalCents: rec.totalCents,
        promoCode: rec.promoCode,
        passes: rec.passes,
        lines: rec.lines
      });
      rec.simulatedEmail = {
        bookingId: rec.bookingId,
        toEmail: rendered.toEmail,
        fromEmail: rendered.fromEmail,
        subject: rendered.subject,
        sentAt: input.now.toISOString(),
        simulatedMessageId: generateSimulatedMessageId(),
        htmlBody: rendered.htmlBody,
        attachments: rendered.attachments
      };
      return { bookingId: rec.bookingId, reference: rec.reference, status: "confirmed" };
    });
  }
  toDetailDto(rec) {
    return {
      bookingId: rec.bookingId,
      reference: rec.reference,
      mode: rec.mode,
      status: rec.status,
      event: {
        name: EVENT_METADATA.name,
        venue: EVENT_METADATA.venue,
        address: EVENT_METADATA.address,
        datesLabel: "Thu 10 Dec 2026 – Mon 14 Dec 2026"
      },
      booker: {
        fullName: rec.booker.fullName,
        email: rec.booker.email,
        phone: rec.booker.phone,
        age: rec.booker.age
      },
      paymentMethod: rec.paymentMethod,
      subtotalCents: rec.subtotalCents,
      discountCents: rec.discountCents,
      totalCents: rec.totalCents,
      promoCode: rec.promoCode,
      holdExpiresAt: rec.holdExpiresAt.toISOString(),
      createdAt: rec.createdAt.toISOString(),
      confirmedAt: rec.confirmedAt ? rec.confirmedAt.toISOString() : null,
      lines: rec.lines,
      passes: rec.passes,
      invoice: rec.invoice,
      email: rec.simulatedEmail ? {
        status: "sent",
        toEmail: rec.simulatedEmail.toEmail,
        subject: rec.simulatedEmail.subject,
        sentAt: rec.simulatedEmail.sentAt
      } : null
    };
  }
  async getBookingDetail(bookingId, now) {
    return this.withLock(async () => {
      this.releaseExpiredInternal(now);
      const rec = this.bookings.get(bookingId);
      return rec ? this.toDetailDto(rec) : null;
    });
  }
  async getSimulatedEmail(bookingId) {
    const rec = this.bookings.get(bookingId);
    return rec?.simulatedEmail ?? null;
  }
  async createOrRefreshOtp(params) {
    const norm = normalizeEmail(params.email);
    this.otps.set(norm, {
      codeHash: params.codeHash,
      expiresAt: params.expiresAt,
      consumed: false
    });
  }
  async verifyOtpAndCreateSession(params) {
    const norm = normalizeEmail(params.email);
    const otp = this.otps.get(norm);
    if (!otp || otp.consumed || otp.codeHash !== params.codeHash || otp.expiresAt <= params.now) {
      return null;
    }
    otp.consumed = true;
    let user = this.usersByEmail.get(norm);
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: params.email.trim(),
        fullName: params.fullName?.trim() || norm.split("@")[0]?.replace(/[._-]/g, " ") || "Temple Guest",
        phone: params.phone?.trim() || "+1 469-555-0100",
        createdAt: params.now.toISOString()
      };
      this.usersByEmail.set(norm, user);
      this.usersById.set(user.id, user);
    }
    this.seedContributionsForEmail(norm);
    this.sessions.set(params.sessionTokenHash, {
      userId: user.id,
      expiresAt: params.sessionExpiresAt
    });
    return user;
  }
  async createDemoSession(params) {
    const user = this.usersByEmail.get(DEMO_PROFILE.emailNormalized);
    this.sessions.set(params.sessionTokenHash, {
      userId: user.id,
      expiresAt: params.sessionExpiresAt
    });
    return user;
  }
  async getUserBySessionToken(tokenHash, now) {
    const sess = this.sessions.get(tokenHash);
    if (!sess || sess.expiresAt <= now) return null;
    return this.usersById.get(sess.userId) ?? null;
  }
  async deleteSession(tokenHash) {
    this.sessions.delete(tokenHash);
  }
  async updateUserProfile(userId, updates) {
    const user = this.usersById.get(userId);
    if (!user) throw new NotFoundError("User profile not found.");
    const updated = {
      ...user,
      fullName: updates.fullName.trim(),
      phone: updates.phone.trim()
    };
    this.usersById.set(userId, updated);
    this.usersByEmail.set(normalizeEmail(updated.email), updated);
    return updated;
  }
  async listBookingsForEmail(emailNormalized, now) {
    return this.withLock(async () => {
      this.releaseExpiredInternal(now);
      return [...this.bookings.values()].filter(
        (b) => b.booker.emailNormalized === emailNormalized && (b.status === "confirmed" || b.status === "pending_payment")
      ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((b) => this.toDetailDto(b));
    });
  }
  async listContributionsForEmail(emailNormalized) {
    this.seedContributionsForEmail(emailNormalized);
    return this.contributionsByEmail.get(emailNormalized) ?? [];
  }
  async resetInventoryToDefaults() {
    return this.withLock(async () => {
      for (const rec of this.bookings.values()) {
        if (rec.status === "pending_payment") {
          rec.status = "expired";
        }
      }
      for (const item of DEFAULT_CATALOG) {
        this.products.set(item.code, { ...item });
      }
      for (const p of DEFAULT_PROMOS) {
        this.promos.set(p.code, { ...p });
      }
    });
  }
}
const SELLER_EIN = "47-1928374 (501(c)(3) Tax-Exempt)";
async function releaseExpiredInTx(client, now) {
  const expiredRes = await client.query(
    `UPDATE bookings
        SET status = 'expired'
      WHERE status = 'pending_payment' AND hold_expires_at <= $1
      RETURNING id, promo_code_id`,
    [now.toISOString()]
  );
  if (expiredRes.rows.length === 0) {
    return 0;
  }
  const expiredIds = expiredRes.rows.map((r) => r.id);
  const lineTotals = await client.query(
    `SELECT product_id, SUM(quantity)::text AS qty
       FROM booking_lines
      WHERE booking_id = ANY($1::uuid[])
      GROUP BY product_id`,
    [expiredIds]
  );
  for (const row of lineTotals.rows) {
    await client.query(
      `UPDATE inventory
          SET remaining = LEAST(total, remaining + $1), updated_at = now()
        WHERE product_id = $2`,
      [Number(row.qty), row.product_id]
    );
  }
  const promoIds = expiredRes.rows.map((r) => r.promo_code_id).filter((id) => Boolean(id));
  for (const promoId of promoIds) {
    await client.query(
      `UPDATE promo_codes
          SET used_count = GREATEST(0, used_count - 1)
        WHERE id = $1`,
      [promoId]
    );
  }
  return expiredRes.rows.length;
}
class PostgresDataStore {
  constructor(pool) {
    this.pool = pool;
  }
  async ready() {
    await ensureBootstrapped(this.pool);
  }
  async getCatalogAndPromos() {
    await this.ready();
    const prodRows = await this.pool.query(
      `SELECT p.code, p.name, p.description, p.category, p.age_band,
              p.pricing_unit, p.day_rule, p.allowed_dates, p.unit_price_cents,
              p.max_adults, p.max_children, p.sort_order,
              COALESCE(i.total, 0) AS total,
              COALESCE(i.remaining, 0) AS remaining
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.is_active = true
        ORDER BY p.sort_order ASC`
    );
    const promoRows = await this.pool.query(
      `SELECT code, description, discount_type, percent_bps, amount_cents,
              min_subtotal_exclusive_cents, valid_from_iso, valid_until_iso,
              max_uses, used_count, is_active
         FROM promo_codes`
    );
    const products2 = prodRows.rows.length > 0 ? prodRows.rows.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      category: r.category,
      ageBand: r.age_band,
      pricingUnit: r.pricing_unit,
      dayRule: r.day_rule,
      allowedDates: r.allowed_dates,
      unitPriceCents: cents(r.unit_price_cents),
      totalStock: r.total,
      remainingStock: r.remaining,
      maxAdults: r.max_adults,
      maxChildren: r.max_children,
      sortOrder: r.sort_order
    })) : DEFAULT_CATALOG.map((item) => ({
      ...item,
      totalStock: 0,
      remainingStock: 0
    }));
    return {
      products: products2,
      promos: promoRows.rows.map((p) => ({
        code: p.code,
        description: p.description,
        discountType: p.discount_type,
        percentBps: p.percent_bps,
        amountCents: p.amount_cents !== null ? cents(p.amount_cents) : null,
        minSubtotalExclusiveCents: p.min_subtotal_exclusive_cents !== null ? cents(p.min_subtotal_exclusive_cents) : null,
        validFromIso: p.valid_from_iso,
        validUntilIso: p.valid_until_iso,
        maxUses: p.max_uses,
        usedCount: p.used_count,
        isActive: p.is_active
      }))
    };
  }
  async releaseExpiredHolds(now) {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const released = await releaseExpiredInTx(client, now);
      await client.query("COMMIT");
      return released;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  async queryPriorPromoRedemption(queryable, participants, now) {
    if (participants.length === 0) return null;
    const bookingRows = await queryable.query(
      `SELECT id, reference, promo_code_text, booker_full_name, booker_email, booker_phone
         FROM bookings
        WHERE promo_code_text IS NOT NULL
          AND (status = 'confirmed' OR (status = 'pending_payment' AND hold_expires_at > $1))
        ORDER BY created_at ASC`,
      [now.toISOString()]
    );
    if (bookingRows.rows.length === 0) return null;
    const bookingIds = bookingRows.rows.map((b) => b.id);
    const attRows = await queryable.query(
      `SELECT booking_id, selected_category, full_name, email, phone, guardian_phone
         FROM attendees
        WHERE booking_id = ANY($1::uuid[])`,
      [bookingIds]
    );
    const attendeesByBooking = /* @__PURE__ */ new Map();
    for (const row of attRows.rows) {
      const list = attendeesByBooking.get(row.booking_id) ?? [];
      list.push(row);
      attendeesByBooking.set(row.booking_id, list);
    }
    for (const bk of bookingRows.rows) {
      const storedParticipants = collectPromoParticipants({
        booker: {
          fullName: bk.booker_full_name,
          email: bk.booker_email,
          phone: bk.booker_phone
        },
        attendees: (attendeesByBooking.get(bk.id) ?? []).map((a) => ({
          category: a.selected_category,
          fullName: a.full_name,
          email: a.email,
          phone: a.phone,
          guardianPhone: a.guardian_phone
        }))
      });
      const storedKeySet = new Set(storedParticipants.map((sp) => sp.key));
      for (const incoming of participants) {
        if (storedKeySet.has(incoming.key)) {
          return {
            participantLabel: incoming.label,
            bookingReference: bk.reference,
            promoCode: bk.promo_code_text
          };
        }
      }
    }
    return null;
  }
  async findPriorPromoRedemption(participants, now) {
    await this.ready();
    return this.queryPriorPromoRedemption(this.pool, participants, now);
  }
  async createBookingHold(input) {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT id, reference, status, subtotal_cents, discount_cents, total_cents,
                hold_expires_at, payment_method, request_hash
           FROM bookings
          WHERE idempotency_key = $1
          FOR UPDATE`,
        [input.idempotencyKey]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.request_hash !== input.requestHash) {
          throw new RuleViolationError(
            "Idempotency-Key has already been used with a different booking payload.",
            [
              {
                path: "idempotencyKey",
                code: "IDEMPOTENCY_KEY_REUSED",
                message: "Start a fresh checkout attempt for modified booking details."
              }
            ],
            "IDEMPOTENCY_KEY_REUSED"
          );
        }
        if (row.status === "pending_payment" || row.status === "confirmed") {
          await client.query("COMMIT");
          return {
            bookingId: row.id,
            reference: row.reference,
            status: row.status,
            currency: "USD",
            subtotalCents: row.subtotal_cents,
            discountCents: row.discount_cents,
            totalCents: row.total_cents,
            holdExpiresAt: row.hold_expires_at.toISOString(),
            paymentMethod: row.payment_method,
            paymentUrl: row.status === "confirmed" ? null : `/pay/${row.id}?method=${row.payment_method}`
          };
        }
      }
      await releaseExpiredInTx(client, input.now);
      const evRes = await client.query(
        `SELECT id, hold_minutes FROM events WHERE slug = $1`,
        [EVENT_METADATA.slug]
      );
      const eventRow = evRes.rows[0];
      const activeHolderRows = await client.query(
        `SELECT b.reference, a.selected_category, a.full_name, a.phone, a.guardian_phone, a.valid_dates
           FROM attendees a
           JOIN bookings b ON b.id = a.booking_id
          WHERE b.event_id = $1
            AND (b.status = 'confirmed' OR (b.status = 'pending_payment' AND b.hold_expires_at > $2))`,
        [eventRow.id, input.now.toISOString()]
      );
      for (const pass of input.quote.attendeePasses) {
        const incomingKey = computeAttendeeIdentityKey({
          category: pass.ageBand,
          fullName: pass.fullName,
          phone: pass.phone,
          guardianPhone: pass.guardian?.phone ?? null
        });
        if (!incomingKey) continue;
        for (const row of activeHolderRows.rows) {
          const existingKey = computeAttendeeIdentityKey({
            category: row.selected_category,
            fullName: row.full_name,
            phone: row.phone,
            guardianPhone: row.guardian_phone
          });
          if (existingKey !== incomingKey) continue;
          const overlap = pass.validDates.filter((d) => row.valid_dates.includes(d));
          if (overlap.length > 0) {
            throw new ConflictError(
              "DUPLICATE_PASS_HOLDER",
              `${pass.fullName} already holds an active or confirmed pass for ${formatDatesDisplay(overlap)} (Ref ${row.reference}).`,
              [
                {
                  path: "attendees",
                  code: "DUPLICATE_ATTENDEE",
                  message: `${pass.fullName} already holds a pass for ${formatDatesDisplay(overlap)}.`
                }
              ]
            );
          }
        }
      }
      const sortedDemand = [...input.quote.stockDemand.entries()].sort(
        ([a], [b]) => a.localeCompare(b)
      );
      const productIdByCode = /* @__PURE__ */ new Map();
      for (const [code, qty] of sortedDemand) {
        if (qty <= 0) continue;
        const upd = await client.query(
          `UPDATE inventory i
              SET remaining = i.remaining - $1, updated_at = now()
             FROM products p
            WHERE i.product_id = p.id
              AND p.event_id = $2
              AND p.code = $3
              AND i.remaining >= $1
            RETURNING p.id AS product_id`,
          [qty, eventRow.id, code]
        );
        if (upd.rows.length === 0) {
          const cur = await client.query(
            `SELECT p.name, i.remaining
               FROM products p
               JOIN inventory i ON i.product_id = p.id
              WHERE p.event_id = $1 AND p.code = $2`,
            [eventRow.id, code]
          );
          const prodName = cur.rows[0]?.name ?? code;
          const rem = cur.rows[0]?.remaining ?? 0;
          throw new ConflictError(
            "INSUFFICIENT_STOCK",
            rem <= 0 ? `${prodName} just sold out.` : `Only ${rem} ${prodName} remaining — someone else just booked the remaining spots.`,
            [
              {
                path: `stock.${code}`,
                code: rem <= 0 ? "PRODUCT_SOLD_OUT" : "INSUFFICIENT_STOCK",
                message: `Available: ${rem}, requested: ${qty}.`
              }
            ]
          );
        }
        productIdByCode.set(code, upd.rows[0].product_id);
      }
      const allProdRows = await client.query(
        `SELECT id, code FROM products WHERE event_id = $1`,
        [eventRow.id]
      );
      for (const pr of allProdRows.rows) {
        productIdByCode.set(pr.code, pr.id);
      }
      let promoCodeId = null;
      let promoCodeText = null;
      if (input.quote.promo.status === "applied") {
        const currentPromoParticipants = collectPromoParticipants({
          booker: input.booker,
          attendees: input.quote.attendeePasses.map((p) => ({
            category: p.ageBand,
            fullName: p.fullName,
            email: p.email,
            phone: p.phone,
            guardianPhone: p.guardian?.phone ?? null
          }))
        });
        const priorRedemption = await this.queryPriorPromoRedemption(
          client,
          currentPromoParticipants,
          input.now
        );
        if (priorRedemption) {
          throw new ConflictError(
            "PROMO_ALREADY_USED",
            `Coupon limit reached: ${priorRedemption.participantLabel} already benefited from promo code ${priorRedemption.promoCode} on booking ${priorRedemption.bookingReference}. Coupons are limited to 1 per booker and attendee.`,
            [
              {
                path: "promoCode",
                code: "PROMO_ALREADY_USED",
                message: `${priorRedemption.participantLabel} already used promo code ${priorRedemption.promoCode} on booking ${priorRedemption.bookingReference}.`
              }
            ]
          );
        }
        const promoRes = await client.query(
          `UPDATE promo_codes
              SET used_count = used_count + 1
            WHERE event_id = $1
              AND code = $2
              AND is_active = true
              AND (max_uses IS NULL OR used_count < max_uses)
              AND (valid_until_iso IS NULL OR valid_until_iso > $3)
            RETURNING id, code`,
          [eventRow.id, input.quote.promo.code, input.now.toISOString()]
        );
        if (promoRes.rows.length === 0) {
          throw new ConflictError(
            "PROMO_EXHAUSTED",
            `Promo code "${input.quote.promo.code}" is no longer available.`
          );
        }
        promoCodeId = promoRes.rows[0].id;
        promoCodeText = promoRes.rows[0].code;
      }
      const autoConfirm = input.quote.totalCents === 0;
      const status = autoConfirm ? "confirmed" : "pending_payment";
      const holdExpiresAt = new Date(
        input.now.getTime() + eventRow.hold_minutes * 60 * 1e3
      );
      const reference = generateBookingReference();
      const bookingRes = await client.query(
        `INSERT INTO bookings (
           reference, event_id, user_id, mode, status,
           booker_full_name, booker_email, booker_email_normalized, booker_phone, booker_age,
           promo_code_id, promo_code_text,
           subtotal_cents, discount_cents, total_cents, currency,
           payment_method, idempotency_key, request_hash, hold_expires_at, confirmed_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'USD',$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          reference,
          eventRow.id,
          input.userId,
          input.mode,
          status,
          input.booker.fullName.trim(),
          input.booker.email.trim(),
          normalizeEmail(input.booker.email),
          input.booker.phone.trim(),
          input.booker.age,
          promoCodeId,
          promoCodeText,
          input.quote.subtotalCents,
          input.quote.discountCents,
          input.quote.totalCents,
          input.paymentMethod,
          input.idempotencyKey,
          input.requestHash,
          holdExpiresAt.toISOString(),
          autoConfirm ? input.now.toISOString() : null
        ]
      );
      const bookingId = bookingRes.rows[0].id;
      const issuedPasses = [];
      for (let i = 0; i < input.quote.attendeePasses.length; i += 1) {
        const p = input.quote.attendeePasses[i];
        const passCode = generatePassCode();
        const attRes = await client.query(
          `INSERT INTO attendees (
             booking_id, position, pass_code, is_booker,
             selected_category, age_band, full_name, email, phone, age,
             pass_kind, pass_label, valid_dates, valid_dates_display,
             extras_summary, guardian_name, guardian_phone
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17)
           RETURNING id`,
          [
            bookingId,
            i,
            passCode,
            i === 0 && input.booker.isAttending,
            p.ageBand,
            p.ageBand,
            p.fullName,
            p.email,
            p.phone,
            p.age,
            p.passKind,
            p.passLabel,
            JSON.stringify(p.validDates),
            p.validDatesDisplay,
            JSON.stringify(p.extrasSummary),
            p.guardian?.name ?? null,
            p.guardian?.phone ?? null
          ]
        );
        issuedPasses.push({
          attendeeId: attRes.rows[0].id,
          passCode,
          fullName: p.fullName,
          age: p.age,
          ageBand: p.ageBand,
          selectedCategory: p.ageBand,
          passKind: p.passKind,
          passLabel: p.passLabel,
          validDates: [...p.validDates],
          validDatesDisplay: p.validDatesDisplay,
          extrasSummary: [...p.extrasSummary],
          guardianName: p.guardian?.name ?? null,
          guardianPhone: p.guardian?.phone ?? null
        });
      }
      const quoteLinesDto = [];
      for (const line of input.quote.lines) {
        const productId = productIdByCode.get(line.productCode);
        if (!productId) {
          throw new Error(`Missing product_id for ${line.productCode}`);
        }
        await client.query(
          `INSERT INTO booking_lines (
             booking_id, product_id, product_code, label, event_date,
             quantity, unit_price_cents, line_total_cents
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            bookingId,
            productId,
            line.productCode,
            line.label,
            line.eventDate,
            line.quantity,
            line.unitPriceCents,
            line.lineTotalCents
          ]
        );
        quoteLinesDto.push({
          productCode: line.productCode,
          label: line.label,
          attendeeClientId: line.attendeeClientId,
          familyGroupId: line.familyGroupId,
          eventDate: line.eventDate,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents
        });
      }
      if (autoConfirm) {
        const invoiceNumber = generateInvoiceNumber();
        await client.query(
          `INSERT INTO invoices (
             booking_id, invoice_number, issued_at,
             billed_to_name, billed_to_email, billed_to_phone,
             payment_method_label, subtotal_cents, discount_cents, tax_cents, total_cents
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10)`,
          [
            bookingId,
            invoiceNumber,
            input.now.toISOString(),
            input.booker.fullName.trim(),
            input.booker.email.trim(),
            input.booker.phone.trim(),
            "Complimentary ($0 Total after Promo)",
            input.quote.subtotalCents,
            input.quote.discountCents,
            0
          ]
        );
        const rendered = renderConfirmationEmail({
          bookingId,
          reference,
          bookerName: input.booker.fullName.trim(),
          bookerEmail: input.booker.email.trim(),
          invoiceNumber,
          subtotalCents: input.quote.subtotalCents,
          discountCents: input.quote.discountCents,
          totalCents: 0,
          promoCode: promoCodeText,
          passes: issuedPasses,
          lines: quoteLinesDto
        });
        await client.query(
          `INSERT INTO email_outbox (
             booking_id, to_email, from_email, subject, html_body, text_body,
             attachments, status, simulated_message_id, sent_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'sent',$8,$9)
           ON CONFLICT (booking_id) DO NOTHING`,
          [
            bookingId,
            rendered.toEmail,
            rendered.fromEmail,
            rendered.subject,
            rendered.htmlBody,
            rendered.textBody,
            JSON.stringify(rendered.attachments),
            generateSimulatedMessageId(),
            input.now.toISOString()
          ]
        );
      }
      await client.query("COMMIT");
      return {
        bookingId,
        reference,
        status,
        currency: "USD",
        subtotalCents: input.quote.subtotalCents,
        discountCents: input.quote.discountCents,
        totalCents: input.quote.totalCents,
        holdExpiresAt: holdExpiresAt.toISOString(),
        paymentMethod: input.paymentMethod,
        paymentUrl: autoConfirm ? null : `/pay/${bookingId}?method=${input.paymentMethod}`
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  async processSimulatedPayment(input) {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const bkRes = await client.query(
        `SELECT id, reference, status, booker_full_name, booker_email, booker_phone,
                promo_code_id, promo_code_text, subtotal_cents, discount_cents, total_cents,
                hold_expires_at
           FROM bookings
          WHERE id = $1
          FOR UPDATE`,
        [input.bookingId]
      );
      if (bkRes.rows.length === 0) {
        throw new NotFoundError("Booking not found.");
      }
      const booking = bkRes.rows[0];
      if (booking.status === "confirmed") {
        await client.query("COMMIT");
        return {
          bookingId: booking.id,
          reference: booking.reference,
          status: "confirmed"
        };
      }
      if (booking.status === "cancelled") {
        throw new GoneError("BOOKING_CANCELLED", "This booking was cancelled.");
      }
      if (booking.status === "expired" || booking.hold_expires_at <= input.now) {
        await releaseExpiredInTx(client, input.now);
        await client.query("COMMIT");
        throw new GoneError(
          "HOLD_EXPIRED",
          "Your 10-minute reservation hold expired. Please return to the booking form and confirm again."
        );
      }
      const providerRef = `sim_pay_${generateSimulatedMessageId()}`;
      if (input.outcome === "decline") {
        await client.query(
          `INSERT INTO payments (booking_id, method, status, amount_cents, card_last4, provider_ref)
           VALUES ($1,$2,'declined',$3,$4,$5)`,
          [booking.id, input.method, booking.total_cents, input.cardLast4 ?? "0002", providerRef]
        );
        await client.query("COMMIT");
        throw new PaymentDeclinedError();
      }
      if (input.outcome === "cancel") {
        await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [booking.id]);
        const lines = await client.query(
          `SELECT product_id, quantity FROM booking_lines WHERE booking_id = $1`,
          [booking.id]
        );
        for (const l of lines.rows) {
          await client.query(
            `UPDATE inventory SET remaining = LEAST(total, remaining + $1), updated_at = now() WHERE product_id = $2`,
            [l.quantity, l.product_id]
          );
        }
        if (booking.promo_code_id) {
          await client.query(
            `UPDATE promo_codes SET used_count = GREATEST(0, used_count - 1) WHERE id = $1`,
            [booking.promo_code_id]
          );
        }
        await client.query(
          `INSERT INTO payments (booking_id, method, status, amount_cents, card_last4, provider_ref)
           VALUES ($1,$2,'cancelled',$3,$4,$5)`,
          [booking.id, input.method, booking.total_cents, input.cardLast4 ?? null, providerRef]
        );
        await client.query("COMMIT");
        return {
          bookingId: booking.id,
          reference: booking.reference,
          status: "cancelled"
        };
      }
      await client.query(
        `UPDATE bookings
            SET status = 'confirmed', payment_method = $2, confirmed_at = $3
          WHERE id = $1`,
        [booking.id, input.method, input.now.toISOString()]
      );
      await client.query(
        `INSERT INTO payments (booking_id, method, status, amount_cents, card_last4, provider_ref)
         VALUES ($1,$2,'succeeded',$3,$4,$5)`,
        [booking.id, input.method, booking.total_cents, input.cardLast4 ?? "4242", providerRef]
      );
      const methodLabel = input.method === "stripe" ? `Stripe Simulated Checkout (•••• ${input.cardLast4 ?? "4242"})` : `Credit Card Simulated (•••• ${input.cardLast4 ?? "4242"})`;
      const invoiceNumber = generateInvoiceNumber();
      await client.query(
        `INSERT INTO invoices (
           booking_id, invoice_number, issued_at,
           billed_to_name, billed_to_email, billed_to_phone,
           payment_method_label, subtotal_cents, discount_cents, tax_cents, total_cents
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10)
         ON CONFLICT (booking_id) DO NOTHING`,
        [
          booking.id,
          invoiceNumber,
          input.now.toISOString(),
          booking.booker_full_name,
          booking.booker_email,
          booking.booker_phone,
          methodLabel,
          booking.subtotal_cents,
          booking.discount_cents,
          booking.total_cents
        ]
      );
      const passRows = await client.query(
        `SELECT id, pass_code, full_name, age, age_band, selected_category,
                pass_kind, pass_label, valid_dates, valid_dates_display,
                extras_summary, guardian_name, guardian_phone
           FROM attendees
          WHERE booking_id = $1
          ORDER BY position ASC`,
        [booking.id]
      );
      const lineRows = await client.query(
        `SELECT product_code, label, event_date, quantity, unit_price_cents, line_total_cents
           FROM booking_lines
          WHERE booking_id = $1`,
        [booking.id]
      );
      const rendered = renderConfirmationEmail({
        bookingId: booking.id,
        reference: booking.reference,
        bookerName: booking.booker_full_name,
        bookerEmail: booking.booker_email,
        invoiceNumber,
        subtotalCents: booking.subtotal_cents,
        discountCents: booking.discount_cents,
        totalCents: booking.total_cents,
        promoCode: booking.promo_code_text,
        passes: passRows.rows.map((p) => ({
          attendeeId: p.id,
          passCode: p.pass_code,
          fullName: p.full_name,
          age: p.age,
          ageBand: p.age_band,
          selectedCategory: p.selected_category,
          passKind: p.pass_kind,
          passLabel: p.pass_label,
          validDates: p.valid_dates,
          validDatesDisplay: p.valid_dates_display,
          extrasSummary: p.extras_summary,
          guardianName: p.guardian_name,
          guardianPhone: p.guardian_phone
        })),
        lines: lineRows.rows.map((l) => ({
          productCode: l.product_code,
          label: l.label,
          attendeeClientId: null,
          familyGroupId: null,
          eventDate: l.event_date,
          quantity: l.quantity,
          unitPriceCents: l.unit_price_cents,
          lineTotalCents: l.line_total_cents
        }))
      });
      await client.query(
        `INSERT INTO email_outbox (
           booking_id, to_email, from_email, subject, html_body, text_body,
           attachments, status, simulated_message_id, sent_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'sent',$8,$9)
         ON CONFLICT (booking_id) DO NOTHING`,
        [
          booking.id,
          rendered.toEmail,
          rendered.fromEmail,
          rendered.subject,
          rendered.htmlBody,
          rendered.textBody,
          JSON.stringify(rendered.attachments),
          generateSimulatedMessageId(),
          input.now.toISOString()
        ]
      );
      await client.query("COMMIT");
      return {
        bookingId: booking.id,
        reference: booking.reference,
        status: "confirmed"
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  async getBookingDetail(bookingId, now) {
    await this.ready();
    await this.releaseExpiredHolds(now);
    const bkRes = await this.pool.query(
      `SELECT id, reference, mode, status, booker_full_name, booker_email,
              booker_phone, booker_age, payment_method, subtotal_cents,
              discount_cents, total_cents, promo_code_text,
              hold_expires_at, created_at, confirmed_at
         FROM bookings
        WHERE id = $1`,
      [bookingId]
    );
    if (bkRes.rows.length === 0) {
      return null;
    }
    const bk = bkRes.rows[0];
    const [attRes, lineRes, invRes, emRes] = await Promise.all([
      this.pool.query(
        `SELECT id, pass_code, full_name, age, age_band, selected_category,
                pass_kind, pass_label, valid_dates, valid_dates_display,
                extras_summary, guardian_name, guardian_phone
           FROM attendees
          WHERE booking_id = $1
          ORDER BY position ASC`,
        [bookingId]
      ),
      this.pool.query(
        `SELECT product_code, label, event_date, quantity, unit_price_cents, line_total_cents
           FROM booking_lines
          WHERE booking_id = $1`,
        [bookingId]
      ),
      this.pool.query(
        `SELECT invoice_number, issued_at, billed_to_name, billed_to_email,
                billed_to_phone, payment_method_label, subtotal_cents,
                discount_cents, tax_cents, total_cents
           FROM invoices
          WHERE booking_id = $1`,
        [bookingId]
      ),
      this.pool.query(
        `SELECT status, to_email, subject, sent_at
           FROM email_outbox
          WHERE booking_id = $1`,
        [bookingId]
      )
    ]);
    const passes = await Promise.all(
      attRes.rows.map(async (p) => ({
        attendeeId: p.id,
        passCode: p.pass_code,
        fullName: p.full_name,
        age: p.age,
        ageBand: p.age_band,
        selectedCategory: p.selected_category,
        passKind: p.pass_kind,
        passLabel: p.pass_label,
        validDates: p.valid_dates,
        validDatesDisplay: p.valid_dates_display,
        extrasSummary: p.extras_summary,
        guardianName: p.guardian_name,
        guardianPhone: p.guardian_phone,
        qrDataUrl: await QRCode.toDataURL(
          JSON.stringify({ ref: bk.reference, pass: p.pass_code, holder: p.full_name }),
          { width: 160, margin: 1, color: { dark: "#291900", light: "#FDF3E4" } }
        )
      }))
    );
    const inv = invRes.rows[0];
    const em = emRes.rows[0];
    return {
      bookingId: bk.id,
      reference: bk.reference,
      mode: bk.mode,
      status: bk.status,
      event: {
        name: EVENT_METADATA.name,
        venue: EVENT_METADATA.venue,
        address: EVENT_METADATA.address,
        datesLabel: "Thu 10 Dec 2026 – Mon 14 Dec 2026"
      },
      booker: {
        fullName: bk.booker_full_name,
        email: bk.booker_email,
        phone: bk.booker_phone,
        age: bk.booker_age
      },
      paymentMethod: bk.payment_method,
      subtotalCents: bk.subtotal_cents,
      discountCents: bk.discount_cents,
      totalCents: bk.total_cents,
      promoCode: bk.promo_code_text,
      holdExpiresAt: bk.hold_expires_at.toISOString(),
      createdAt: bk.created_at.toISOString(),
      confirmedAt: bk.confirmed_at ? bk.confirmed_at.toISOString() : null,
      lines: lineRes.rows.map((l) => ({
        productCode: l.product_code,
        label: l.label,
        attendeeClientId: null,
        familyGroupId: null,
        eventDate: l.event_date,
        quantity: l.quantity,
        unitPriceCents: l.unit_price_cents,
        lineTotalCents: l.line_total_cents
      })),
      passes,
      invoice: inv ? {
        invoiceNumber: inv.invoice_number,
        issuedAt: inv.issued_at.toISOString(),
        sellerName: EVENT_METADATA.venue,
        sellerAddress: EVENT_METADATA.address,
        sellerEin: SELLER_EIN,
        billedToName: inv.billed_to_name,
        billedToEmail: inv.billed_to_email,
        billedToPhone: inv.billed_to_phone,
        paymentMethodLabel: inv.payment_method_label,
        subtotalCents: inv.subtotal_cents,
        discountCents: inv.discount_cents,
        taxCents: inv.tax_cents,
        totalCents: inv.total_cents,
        promoCode: bk.promo_code_text
      } : null,
      email: em ? {
        status: em.status,
        toEmail: em.to_email,
        subject: em.subject,
        sentAt: em.sent_at ? em.sent_at.toISOString() : null
      } : null
    };
  }
  async getSimulatedEmail(bookingId) {
    await this.ready();
    const res = await this.pool.query(
      `SELECT booking_id, to_email, from_email, subject, sent_at,
              simulated_message_id, html_body, attachments
         FROM email_outbox
        WHERE booking_id = $1`,
      [bookingId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      bookingId: row.booking_id,
      toEmail: row.to_email,
      fromEmail: row.from_email,
      subject: row.subject,
      sentAt: row.sent_at.toISOString(),
      simulatedMessageId: row.simulated_message_id,
      htmlBody: row.html_body,
      attachments: row.attachments
    };
  }
  async createOrRefreshOtp(params) {
    await this.ready();
    const norm = normalizeEmail(params.email);
    await this.pool.query(
      `INSERT INTO auth_otps (email_normalized, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [norm, params.codeHash, params.expiresAt.toISOString()]
    );
  }
  async ensureDefaultContributionsForUser(userId, emailNorm) {
    const existing = await this.pool.query(
      `SELECT COUNT(*)::text AS count FROM contributions WHERE email_normalized = $1`,
      [emailNorm]
    );
    if (Number(existing.rows[0]?.count ?? "0") === 0) {
      for (const c of SEEDED_CONTRIBUTIONS) {
        await this.pool.query(
          `INSERT INTO contributions (
             user_id, email_normalized, title, organization, category,
             amount_cents, contributed_on, summary, impact_badge
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            userId,
            emailNorm,
            c.title,
            c.organization,
            c.category,
            c.amountCents,
            c.contributedOn,
            c.summary,
            c.impactBadge
          ]
        );
      }
    }
  }
  async verifyOtpAndCreateSession(params) {
    await this.ready();
    const norm = normalizeEmail(params.email);
    const otpRes = await this.pool.query(
      `UPDATE auth_otps
          SET consumed_at = $3
        WHERE id = (
          SELECT id FROM auth_otps
           WHERE email_normalized = $1
             AND code_hash = $2
             AND consumed_at IS NULL
             AND expires_at > $3
           ORDER BY created_at DESC
           LIMIT 1
        )
        RETURNING id`,
      [norm, params.codeHash, params.now.toISOString()]
    );
    if (otpRes.rows.length === 0) {
      return null;
    }
    const defaultName = params.fullName?.trim() || norm.split("@")[0]?.replace(/[._-]/g, " ") || "Temple Guest";
    const defaultPhone = params.phone?.trim() || "+1 469-555-0100";
    const userRes = await this.pool.query(
      `INSERT INTO users (email, email_normalized, full_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email_normalized) DO UPDATE SET
         updated_at = now()
       RETURNING id, email, full_name, phone, created_at`,
      [params.email.trim(), norm, defaultName, defaultPhone]
    );
    const user = userRes.rows[0];
    await this.pool.query(
      `UPDATE bookings SET user_id = $1 WHERE booker_email_normalized = $2 AND user_id IS NULL`,
      [user.id, norm]
    );
    await this.ensureDefaultContributionsForUser(user.id, norm);
    await this.pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, params.sessionTokenHash, params.sessionExpiresAt.toISOString()]
    );
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      createdAt: user.created_at.toISOString()
    };
  }
  async createDemoSession(params) {
    await this.ready();
    const userRes = await this.pool.query(
      `SELECT id, email, full_name, phone, created_at
         FROM users
        WHERE email_normalized = $1`,
      [DEMO_PROFILE.emailNormalized]
    );
    const user = userRes.rows[0];
    await this.pool.query(
      `UPDATE bookings SET user_id = $1 WHERE booker_email_normalized = $2 AND user_id IS NULL`,
      [user.id, DEMO_PROFILE.emailNormalized]
    );
    await this.pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, params.sessionTokenHash, params.sessionExpiresAt.toISOString()]
    );
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      createdAt: user.created_at.toISOString()
    };
  }
  async getUserBySessionToken(tokenHash, now) {
    await this.ready();
    const res = await this.pool.query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.created_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now.toISOString()]
    );
    const u = res.rows[0];
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phone: u.phone,
      createdAt: u.created_at.toISOString()
    };
  }
  async deleteSession(tokenHash) {
    await this.ready();
    await this.pool.query(`DELETE FROM user_sessions WHERE token_hash = $1`, [tokenHash]);
  }
  async updateUserProfile(userId, updates) {
    await this.ready();
    const res = await this.pool.query(
      `UPDATE users
          SET full_name = $2, phone = $3, updated_at = now()
        WHERE id = $1
        RETURNING id, email, full_name, phone, created_at`,
      [userId, updates.fullName.trim(), updates.phone.trim()]
    );
    const u = res.rows[0];
    if (!u) throw new NotFoundError("User profile not found.");
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phone: u.phone,
      createdAt: u.created_at.toISOString()
    };
  }
  async listBookingsForEmail(emailNormalized, now) {
    await this.ready();
    await this.releaseExpiredHolds(now);
    const idsRes = await this.pool.query(
      `SELECT id FROM bookings
        WHERE booker_email_normalized = $1
          AND status IN ('confirmed', 'pending_payment')
        ORDER BY created_at DESC`,
      [emailNormalized]
    );
    const details = await Promise.all(
      idsRes.rows.map((r) => this.getBookingDetail(r.id, now))
    );
    return details.filter((d) => d !== null);
  }
  async listContributionsForEmail(emailNormalized) {
    await this.ready();
    const res = await this.pool.query(
      `SELECT id, title, organization, category, amount_cents,
              contributed_on, summary, impact_badge
         FROM contributions
        WHERE email_normalized = $1
        ORDER BY contributed_on DESC`,
      [emailNormalized]
    );
    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      organization: r.organization,
      category: r.category,
      amountCents: r.amount_cents,
      contributedOn: r.contributed_on,
      summary: r.summary,
      impactBadge: r.impact_badge
    }));
  }
  async resetInventoryToDefaults() {
    await this.ready();
    await this.pool.query(
      `UPDATE bookings SET status = 'expired' WHERE status = 'pending_payment'`
    );
    await seedDatabase(this.pool, { resetStock: true });
  }
}
let singletonStore = null;
function getDefaultStore() {
  if (!singletonStore) {
    if (hasDatabaseUrl() || process.env.VERCEL === "1") {
      singletonStore = new PostgresDataStore(getPool());
    } else {
      console.warn(
        "[store] DATABASE_URL not configured — running with InMemoryTransactionalStore for local development."
      );
      singletonStore = new InMemoryTransactionalStore();
    }
  }
  return singletonStore;
}
const SESSION_COOKIE_NAME = "su_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1e3;
function toDomainBookingIntent(dto) {
  return {
    mode: dto.mode,
    booker: dto.booker,
    attendees: dto.attendees,
    familyGroups: dto.familyGroups,
    promoCode: dto.promoCode
  };
}
function extractIntentPromoParticipants(intent) {
  return collectPromoParticipants({
    booker: intent.booker,
    attendees: intent.attendees.map((a) => ({
      category: a.selectedCategory,
      fullName: a.fullName,
      email: a.email ?? null,
      phone: a.phone ?? null,
      guardianPhone: a.guardian?.phone ?? null
    }))
  });
}
function createApp(deps = {}) {
  const store = deps.store ?? getDefaultStore();
  const clock = deps.clock ?? createClock();
  const app2 = express();
  app2.disable("x-powered-by");
  app2.set("trust proxy", 1);
  app2.use((req, res, next) => {
    const id = `req_${crypto.randomBytes(6).toString("hex")}`;
    req.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
  });
  app2.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app2.use(cookieParser());
  app2.use(express.json({ limit: "128kb" }));
  app2.use(async (req, _res, next) => {
    const rawToken = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string" ? req.cookies[SESSION_COOKIE_NAME] : null;
    if (!rawToken) {
      req.currentUser = null;
      next();
      return;
    }
    req.currentUser = await store.getUserBySessionToken(sha256Hex(rawToken), clock.now());
    next();
  });
  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: clock.nowIso() });
  });
  api.get("/event", async (_req, res) => {
    await store.releaseExpiredHolds(clock.now());
    const { products: products2 } = await store.getCatalogAndPromos();
    const response = {
      event: {
        slug: EVENT_METADATA.slug,
        name: EVENT_METADATA.name,
        venue: EVENT_METADATA.venue,
        address: EVENT_METADATA.address,
        timezone: EVENT_METADATA.timezone,
        currency: "USD",
        startsOn: EVENT_METADATA.startsOn,
        endsOn: EVENT_METADATA.endsOn,
        ageReferenceDate: EVENT_METADATA.ageReferenceDate,
        holdMinutes: EVENT_METADATA.holdMinutes,
        maxAttendeesPerBooking: EVENT_METADATA.maxAttendeesPerBooking,
        maxDandiyaPairsPerAttendee: EVENT_METADATA.maxDandiyaPairsPerAttendee,
        todayIsoDate: clock.todayFestivalIsoDate()
      },
      days: FESTIVAL_DAYS.map((d) => ({
        date: d.date,
        shortLabel: d.shortLabel,
        fullLabel: d.fullLabel,
        highlight: d.highlight
      })),
      products: products2.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
        ageBand: p.ageBand,
        pricingUnit: p.pricingUnit,
        dayRule: p.dayRule,
        allowedDates: p.allowedDates ? [...p.allowedDates] : null,
        unitPriceCents: p.unitPriceCents,
        availability: {
          total: p.totalStock,
          remaining: p.remainingStock,
          status: getStockStatus(p.remainingStock)
        }
      }))
    };
    res.json(response);
  });
  const quoteLimiter = rateLimit({
    windowMs: 6e4,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  });
  api.post("/quote", quoteLimiter, async (req, res) => {
    const parsed = parseBody(BookingIntentSchema, req.body);
    const now = clock.now();
    await store.releaseExpiredHolds(now);
    const { products: products2, promos } = await store.getCatalogAndPromos();
    const domainIntent = toDomainBookingIntent(parsed);
    const priorPromoRedemption = parsed.promoCode?.trim() ? await store.findPriorPromoRedemption(extractIntentPromoParticipants(domainIntent), now) : null;
    const result = calculateBookingQuote({
      intent: domainIntent,
      products: products2,
      promos,
      nowIso: now.toISOString(),
      todayIsoDate: clock.todayFestivalIsoDate(),
      strictPromo: false,
      priorPromoRedemption
    });
    if (!result.ok) {
      throw new RuleViolationError(
        "Please fix the highlighted booking rules before continuing.",
        result.violations
      );
    }
    const dto = {
      currency: "USD",
      lines: result.quote.lines.map((l) => ({
        productCode: l.productCode,
        label: l.label,
        attendeeClientId: l.attendeeClientId,
        familyGroupId: l.familyGroupId,
        eventDate: l.eventDate,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents
      })),
      attendeePasses: result.quote.attendeePasses.map((p) => ({
        clientId: p.clientId,
        fullName: p.fullName,
        age: p.age,
        ageBand: p.ageBand,
        requiresGuardian: p.requiresGuardian,
        guardian: p.guardian,
        passKind: p.passKind,
        passLabel: p.passLabel,
        validDates: [...p.validDates],
        validDatesDisplay: p.validDatesDisplay,
        extrasSummary: [...p.extrasSummary]
      })),
      subtotalCents: result.quote.subtotalCents,
      discountCents: result.quote.discountCents,
      totalCents: result.quote.totalCents,
      promo: {
        status: result.quote.promo.status,
        code: result.quote.promo.code,
        discountCents: result.quote.promo.discountCents,
        message: result.quote.promo.message,
        rejectionCode: result.quote.promo.rejectionCode
      },
      warnings: [...result.quote.warnings]
    };
    res.json(dto);
  });
  api.post("/bookings", async (req, res) => {
    const rawIdemKey = req.header("Idempotency-Key")?.trim();
    if (!rawIdemKey || rawIdemKey.length < 8 || rawIdemKey.length > 128) {
      throw new BadRequestError("A valid Idempotency-Key header (8–128 chars) is required.");
    }
    const parsed = parseBody(CreateBookingRequestSchema, req.body);
    const now = clock.now();
    await store.releaseExpiredHolds(now);
    const { products: products2, promos } = await store.getCatalogAndPromos();
    const domainIntent = toDomainBookingIntent(parsed);
    const priorPromoRedemption = parsed.promoCode?.trim() ? await store.findPriorPromoRedemption(extractIntentPromoParticipants(domainIntent), now) : null;
    const quoteResult = calculateBookingQuote({
      intent: domainIntent,
      products: products2,
      promos,
      nowIso: now.toISOString(),
      todayIsoDate: clock.todayFestivalIsoDate(),
      strictPromo: true,
      priorPromoRedemption
    });
    if (!quoteResult.ok) {
      throw new RuleViolationError(
        "Booking validation failed on server.",
        quoteResult.violations
      );
    }
    if (quoteResult.quote.totalCents !== parsed.expectedTotalCents) {
      throw new ConflictError(
        "PRICE_CHANGED",
        `Server calculated ${formatUSD(quoteResult.quote.totalCents)}, which differs from client expected total. Please review the updated amount.`
      );
    }
    const created = await store.createBookingHold({
      idempotencyKey: rawIdemKey,
      requestHash: hashRequestPayload({
        mode: parsed.mode,
        booker: parsed.booker,
        attendees: parsed.attendees,
        familyGroups: parsed.familyGroups,
        promoCode: parsed.promoCode ?? "",
        paymentMethod: parsed.paymentMethod
      }),
      userId: req.currentUser?.id ?? null,
      mode: parsed.mode,
      booker: parsed.booker,
      paymentMethod: parsed.paymentMethod,
      quote: quoteResult.quote,
      now
    });
    res.status(201).json(created);
  });
  api.get("/bookings/:id", async (req, res) => {
    const detail = await store.getBookingDetail(req.params.id, clock.now());
    if (!detail) {
      throw new NotFoundError("Booking not found.");
    }
    res.json(detail);
  });
  api.post("/bookings/:id/simulate-pay", async (req, res) => {
    const parsed = parseBody(SimulatePaymentRequestSchema, req.body);
    const bookingId = req.params.id;
    if (!bookingId) {
      throw new BadRequestError("Missing booking ID.");
    }
    const result = await store.processSimulatedPayment({
      bookingId,
      outcome: parsed.outcome,
      method: parsed.method,
      cardLast4: parsed.cardLast4,
      now: clock.now()
    });
    const redirectUrl = result.status === "confirmed" ? `/book?bookingId=${result.bookingId}&payment=success` : `/book?bookingId=${result.bookingId}&payment=cancelled`;
    res.json({
      bookingId: result.bookingId,
      reference: result.reference,
      status: result.status,
      redirectUrl,
      message: result.status === "confirmed" ? "Payment confirmed! Your festival passes and invoice are ready." : "Booking cancelled and held tickets returned to availability."
    });
  });
  api.get("/bookings/:id/passes.pdf", async (req, res) => {
    const detail = await store.getBookingDetail(req.params.id, clock.now());
    if (!detail) {
      throw new NotFoundError("Booking not found.");
    }
    if (detail.status !== "confirmed") {
      throw new ConflictError(
        "NOT_CONFIRMED",
        "Festival passes are only issued once payment is confirmed."
      );
    }
    const attendeeIdFilter = typeof req.query.attendeeId === "string" ? req.query.attendeeId : void 0;
    const targetPasses = attendeeIdFilter ? detail.passes.filter((p) => p.attendeeId === attendeeIdFilter) : detail.passes;
    if (targetPasses.length === 0) {
      throw new NotFoundError("Requested passholder not found in this booking.");
    }
    const pdfBuffer = await generateBoardingPassesPdf(detail, targetPasses);
    const filename = targetPasses.length === 1 ? `Sharad-Utsav-Pass-${targetPasses[0].passCode}.pdf` : `Sharad-Utsav-Passes-${detail.reference}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  });
  api.get("/bookings/:id/invoice.pdf", async (req, res) => {
    const detail = await store.getBookingDetail(req.params.id, clock.now());
    if (!detail) {
      throw new NotFoundError("Booking not found.");
    }
    if (detail.status !== "confirmed" || !detail.invoice) {
      throw new ConflictError(
        "NOT_CONFIRMED",
        "Invoice is generated once payment is confirmed."
      );
    }
    const pdfBuffer = await generateInvoicePdf(detail);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Invoice-${detail.invoice.invoiceNumber}.pdf"`
    );
    res.send(pdfBuffer);
  });
  api.get("/bookings/:id/email", async (req, res) => {
    const email = await store.getSimulatedEmail(req.params.id);
    if (!email) {
      throw new NotFoundError("Confirmation email has not been generated for this booking yet.");
    }
    res.json(email);
  });
  function setSessionCookie(res, rawToken) {
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
      path: "/"
    });
  }
  api.get("/auth/session", (req, res) => {
    res.json({
      authenticated: Boolean(req.currentUser),
      user: req.currentUser ?? null
    });
  });
  api.post("/auth/demo", async (_req, res) => {
    const rawToken = generateSessionToken();
    const user = await store.createDemoSession({
      sessionTokenHash: sha256Hex(rawToken),
      sessionExpiresAt: new Date(clock.now().getTime() + SESSION_TTL_MS)
    });
    setSessionCookie(res, rawToken);
    res.json({ authenticated: true, user });
  });
  api.post("/auth/request-otp", async (req, res) => {
    const parsed = parseBody(RequestOtpSchema, req.body);
    const otpCode = generateSixDigitOtp();
    const expiresAt = new Date(clock.now().getTime() + 10 * 60 * 1e3);
    await store.createOrRefreshOtp({
      email: parsed.email,
      codeHash: sha256Hex(otpCode),
      expiresAt,
      fullName: parsed.fullName,
      phone: parsed.phone
    });
    res.json({
      sent: true,
      email: parsed.email.trim(),
      simulatedOtpCode: otpCode,
      expiresInMinutes: 10
    });
  });
  api.post("/auth/verify-otp", async (req, res) => {
    const parsed = parseBody(VerifyOtpSchema, req.body);
    const rawToken = generateSessionToken();
    const now = clock.now();
    const user = await store.verifyOtpAndCreateSession({
      email: parsed.email,
      codeHash: sha256Hex(parsed.code.trim()),
      sessionTokenHash: sha256Hex(rawToken),
      sessionExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      now,
      fullName: parsed.fullName,
      phone: parsed.phone
    });
    if (!user) {
      throw new RuleViolationError("Invalid or expired verification code.", [
        {
          path: "code",
          code: "INVALID_OTP",
          message: "That 6-digit code is incorrect or has expired."
        }
      ]);
    }
    setSessionCookie(res, rawToken);
    res.json({ authenticated: true, user });
  });
  api.post("/auth/logout", async (req, res) => {
    const rawToken = typeof req.cookies?.[SESSION_COOKIE_NAME] === "string" ? req.cookies[SESSION_COOKIE_NAME] : null;
    if (rawToken) {
      await store.deleteSession(sha256Hex(rawToken));
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.status(204).send();
  });
  api.get("/me", (req, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError("Please sign in from the profile menu to view your details.");
    }
    res.json({ user: req.currentUser });
  });
  api.patch("/me", async (req, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError();
    }
    const parsed = parseBody(UpdateProfileSchema, req.body);
    const updated = await store.updateUserProfile(req.currentUser.id, parsed);
    res.json({ user: updated });
  });
  api.get("/me/bookings", async (req, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError();
    }
    const list = await store.listBookingsForEmail(
      normalizeEmail(req.currentUser.email),
      clock.now()
    );
    res.json({ bookings: list });
  });
  api.get("/me/contributions", async (req, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError();
    }
    const list = await store.listContributionsForEmail(normalizeEmail(req.currentUser.email));
    res.json({ contributions: list });
  });
  api.get("/cron/maintenance", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (cronSecret) {
      const auth = req.header("Authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        throw new UnauthorizedError("Invalid cron secret.");
      }
    }
    const holdsReleased = await store.releaseExpiredHolds(clock.now());
    res.json({ holdsReleased, timestamp: clock.nowIso() });
  });
  app2.use("/api", api);
  app2.use("/api", (_req, _res, next) => {
    next(new NotFoundError("API endpoint not found."));
  });
  app2.use(
    (err, req, res, _next) => {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: err.message,
            requestId: req.requestId,
            issues: err.issues
          }
        });
        return;
      }
      if (err instanceof SyntaxError && "body" in err) {
        res.status(400).json({
          error: {
            code: "MALFORMED_JSON",
            message: "Request body contains malformed JSON.",
            requestId: req.requestId
          }
        });
        return;
      }
      console.error(`[api-error] requestId=${req.requestId ?? "unknown"}`, err);
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected server error occurred. Please try again.",
          requestId: req.requestId
        }
      });
    }
  );
  return app2;
}
const app = createApp();
export {
  app as default
};
