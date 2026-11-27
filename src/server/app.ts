import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {
  BookingIntentSchema,
  CreateBookingRequestSchema,
  RequestOtpSchema,
  SimulatePaymentRequestSchema,
  UpdateProfileSchema,
  VerifyOtpSchema,
  type EventCatalogResponseDTO,
  type QuoteResponseDTO,
  type UserProfileDTO,
} from '@contract/index';
import {
  calculateBookingQuote,
  collectPromoParticipants,
  EVENT_METADATA,
  FESTIVAL_DAYS,
  formatUSD,
  getStockStatus,
  normalizeEmail,
  type BookingIntent,
} from '@domain/index';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  RuleViolationError,
  UnauthorizedError,
} from './http/app-errors';
import { parseBody } from './http/parse-body';
import { createClock, type Clock } from './lib/clock';
import {
  generateSessionToken,
  generateSixDigitOtp,
  hashRequestPayload,
  sha256Hex,
} from './lib/reference';
import { generateBoardingPassesPdf } from './pdf/boarding-pass.pdf';
import { generateInvoicePdf } from './pdf/invoice.pdf';
import { getDefaultStore } from './store';
import type { BookingDataStore } from './store/types';

const SESSION_COOKIE_NAME = 'su_session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface AppDependencies {
  readonly store?: BookingDataStore;
  readonly clock?: Clock;
}

interface RequestWithContext extends Request {
  requestId?: string;
  currentUser?: UserProfileDTO | null;
}

function toDomainBookingIntent(dto: ReturnType<typeof BookingIntentSchema.parse>): BookingIntent {
  return {
    mode: dto.mode,
    booker: dto.booker,
    attendees: dto.attendees,
    familyGroups: dto.familyGroups,
    promoCode: dto.promoCode,
  };
}

function extractIntentPromoParticipants(intent: BookingIntent) {
  return collectPromoParticipants({
    booker: intent.booker,
    attendees: intent.attendees.map((a) => ({
      category: a.selectedCategory,
      fullName: a.fullName,
      email: a.email ?? null,
      phone: a.phone ?? null,
      guardianPhone: a.guardian?.phone ?? null,
    })),
  });
}

export function createApp(deps: AppDependencies = {}): express.Express {
  const store = deps.store ?? getDefaultStore();
  const clock = deps.clock ?? createClock();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Request correlation ID
  app.use((req: RequestWithContext, res: Response, next: NextFunction) => {
    const id = `req_${crypto.randomBytes(6).toString('hex')}`;
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '128kb' }));

  // Optional user session loader
  app.use(async (req: RequestWithContext, _res: Response, next: NextFunction) => {
    const rawToken =
      typeof req.cookies?.[SESSION_COOKIE_NAME] === 'string'
        ? (req.cookies[SESSION_COOKIE_NAME] as string)
        : null;
    if (!rawToken) {
      req.currentUser = null;
      next();
      return;
    }
    req.currentUser = await store.getUserBySessionToken(sha256Hex(rawToken), clock.now());
    next();
  });

  const api = express.Router();

  // Health check
  api.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: clock.nowIso() });
  });

  // Live Event Catalog & Remaining Stock
  api.get('/event', async (_req, res) => {
    await store.releaseExpiredHolds(clock.now());
    const { products } = await store.getCatalogAndPromos();

    const response: EventCatalogResponseDTO = {
      event: {
        slug: EVENT_METADATA.slug,
        name: EVENT_METADATA.name,
        venue: EVENT_METADATA.venue,
        address: EVENT_METADATA.address,
        timezone: EVENT_METADATA.timezone,
        currency: 'USD',
        startsOn: EVENT_METADATA.startsOn,
        endsOn: EVENT_METADATA.endsOn,
        ageReferenceDate: EVENT_METADATA.ageReferenceDate,
        holdMinutes: EVENT_METADATA.holdMinutes,
        maxAttendeesPerBooking: EVENT_METADATA.maxAttendeesPerBooking,
        maxDandiyaPairsPerAttendee: EVENT_METADATA.maxDandiyaPairsPerAttendee,
        todayIsoDate: clock.todayFestivalIsoDate(),
      },
      days: FESTIVAL_DAYS.map((d) => ({
        date: d.date,
        shortLabel: d.shortLabel,
        fullLabel: d.fullLabel,
        highlight: d.highlight,
      })),
      products: products.map((p) => ({
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
          status: getStockStatus(p.remainingStock),
        },
      })),
    };

    res.json(response);
  });

  // Stateless Server Price & Rule Quote
  const quoteLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  api.post('/quote', quoteLimiter, async (req, res) => {
    const parsed = parseBody(BookingIntentSchema, req.body);
    const now = clock.now();
    await store.releaseExpiredHolds(now);
    const { products, promos } = await store.getCatalogAndPromos();

    const domainIntent = toDomainBookingIntent(parsed);
    const priorPromoRedemption = parsed.promoCode?.trim()
      ? await store.findPriorPromoRedemption(extractIntentPromoParticipants(domainIntent), now)
      : null;

    const result = calculateBookingQuote({
      intent: domainIntent,
      products,
      promos,
      nowIso: now.toISOString(),
      todayIsoDate: clock.todayFestivalIsoDate(),
      strictPromo: false,
      priorPromoRedemption,
    });

    if (!result.ok) {
      throw new RuleViolationError(
        'Please fix the highlighted booking rules before continuing.',
        result.violations,
      );
    }

    const dto: QuoteResponseDTO = {
      currency: 'USD',
      lines: result.quote.lines.map((l) => ({
        productCode: l.productCode,
        label: l.label,
        attendeeClientId: l.attendeeClientId,
        familyGroupId: l.familyGroupId,
        eventDate: l.eventDate,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
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
        extrasSummary: [...p.extrasSummary],
      })),
      subtotalCents: result.quote.subtotalCents,
      discountCents: result.quote.discountCents,
      totalCents: result.quote.totalCents,
      promo: {
        status: result.quote.promo.status,
        code: result.quote.promo.code,
        discountCents: result.quote.promo.discountCents,
        message: result.quote.promo.message,
        rejectionCode: result.quote.promo.rejectionCode,
      },
      warnings: [...result.quote.warnings],
    };

    res.json(dto);
  });

  // Create Booking + Atomic 10-Minute Stock Hold
  api.post('/bookings', async (req: RequestWithContext, res) => {
    const rawIdemKey = req.header('Idempotency-Key')?.trim();
    if (!rawIdemKey || rawIdemKey.length < 8 || rawIdemKey.length > 128) {
      throw new BadRequestError('A valid Idempotency-Key header (8–128 chars) is required.');
    }

    const parsed = parseBody(CreateBookingRequestSchema, req.body);
    const now = clock.now();
    await store.releaseExpiredHolds(now);
    const { products, promos } = await store.getCatalogAndPromos();

    const domainIntent = toDomainBookingIntent(parsed);
    const priorPromoRedemption = parsed.promoCode?.trim()
      ? await store.findPriorPromoRedemption(extractIntentPromoParticipants(domainIntent), now)
      : null;

    const quoteResult = calculateBookingQuote({
      intent: domainIntent,
      products,
      promos,
      nowIso: now.toISOString(),
      todayIsoDate: clock.todayFestivalIsoDate(),
      strictPromo: true,
      priorPromoRedemption,
    });

    if (!quoteResult.ok) {
      throw new RuleViolationError(
        'Booking validation failed on server.',
        quoteResult.violations,
      );
    }

    if (quoteResult.quote.totalCents !== parsed.expectedTotalCents) {
      throw new ConflictError(
        'PRICE_CHANGED',
        `Server calculated ${formatUSD(quoteResult.quote.totalCents)}, which differs from client expected total. Please review the updated amount.`,
      );
    }

    const created = await store.createBookingHold({
      idempotencyKey: rawIdemKey,
      requestHash: hashRequestPayload({
        mode: parsed.mode,
        booker: parsed.booker,
        attendees: parsed.attendees,
        familyGroups: parsed.familyGroups,
        promoCode: parsed.promoCode ?? '',
        paymentMethod: parsed.paymentMethod,
      }),
      userId: req.currentUser?.id ?? null,
      mode: parsed.mode,
      booker: parsed.booker,
      paymentMethod: parsed.paymentMethod,
      quote: quoteResult.quote,
      now,
    });

    res.status(201).json(created);
  });

  // Get Booking Details (passes, invoice, email status)
  api.get('/bookings/:id', async (req, res) => {
    const detail = await store.getBookingDetail(req.params.id, clock.now());
    if (!detail) {
      throw new NotFoundError('Booking not found.');
    }
    res.json(detail);
  });

  // Simulated Payment Gateway Callback
  api.post('/bookings/:id/simulate-pay', async (req, res) => {
    const parsed = parseBody(SimulatePaymentRequestSchema, req.body);
    const bookingId = req.params.id;
    if (!bookingId) {
      throw new BadRequestError('Missing booking ID.');
    }

    const result = await store.processSimulatedPayment({
      bookingId,
      outcome: parsed.outcome,
      method: parsed.method,
      cardLast4: parsed.cardLast4,
      now: clock.now(),
    });

    const redirectUrl =
      result.status === 'confirmed'
        ? `/book?bookingId=${result.bookingId}&payment=success`
        : `/book?bookingId=${result.bookingId}&payment=cancelled`;

    res.json({
      bookingId: result.bookingId,
      reference: result.reference,
      status: result.status,
      redirectUrl,
      message:
        result.status === 'confirmed'
          ? 'Payment confirmed! Your festival passes and invoice are ready.'
          : 'Booking cancelled and held tickets returned to availability.',
    });
  });

  // Vector Festival Pass PDF
  api.get('/bookings/:id/passes.pdf', async (req, res) => {
    const detail = await store.getBookingDetail(req.params.id, clock.now());
    if (!detail) {
      throw new NotFoundError('Booking not found.');
    }
    if (detail.status !== 'confirmed') {
      throw new ConflictError(
        'NOT_CONFIRMED',
        'Festival passes are only issued once payment is confirmed.',
      );
    }

    const attendeeIdFilter =
      typeof req.query.attendeeId === 'string' ? req.query.attendeeId : undefined;
    const targetPasses = attendeeIdFilter
      ? detail.passes.filter((p) => p.attendeeId === attendeeIdFilter)
      : detail.passes;

    if (targetPasses.length === 0) {
      throw new NotFoundError('Requested passholder not found in this booking.');
    }

    const pdfBuffer = await generateBoardingPassesPdf(detail, targetPasses);
    const filename =
      targetPasses.length === 1
        ? `Sharad-Utsav-Pass-${targetPasses[0]!.passCode}.pdf`
        : `Sharad-Utsav-Passes-${detail.reference}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  });

  // Itemized Invoice PDF
  api.get('/bookings/:id/invoice.pdf', async (req, res) => {
    const detail = await store.getBookingDetail(req.params.id, clock.now());
    if (!detail) {
      throw new NotFoundError('Booking not found.');
    }
    if (detail.status !== 'confirmed' || !detail.invoice) {
      throw new ConflictError(
        'NOT_CONFIRMED',
        'Invoice is generated once payment is confirmed.',
      );
    }

    const pdfBuffer = await generateInvoicePdf(detail);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Invoice-${detail.invoice.invoiceNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  });

  // Simulated Sent Confirmation Email Viewer
  api.get('/bookings/:id/email', async (req, res) => {
    const email = await store.getSimulatedEmail(req.params.id);
    if (!email) {
      throw new NotFoundError('Confirmation email has not been generated for this booking yet.');
    }
    res.json(email);
  });

  // Optional Auth & Profile Endpoints
  function setSessionCookie(res: Response, rawToken: string): void {
    res.cookie(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
  }

  api.get('/auth/session', (req: RequestWithContext, res) => {
    res.json({
      authenticated: Boolean(req.currentUser),
      user: req.currentUser ?? null,
    });
  });

  api.post('/auth/demo', async (_req, res) => {
    const rawToken = generateSessionToken();
    const user = await store.createDemoSession({
      sessionTokenHash: sha256Hex(rawToken),
      sessionExpiresAt: new Date(clock.now().getTime() + SESSION_TTL_MS),
    });
    setSessionCookie(res, rawToken);
    res.json({ authenticated: true, user });
  });

  api.post('/auth/request-otp', async (req, res) => {
    const parsed = parseBody(RequestOtpSchema, req.body);
    const otpCode = generateSixDigitOtp();
    const expiresAt = new Date(clock.now().getTime() + 10 * 60 * 1000);

    await store.createOrRefreshOtp({
      email: parsed.email,
      codeHash: sha256Hex(otpCode),
      expiresAt,
      fullName: parsed.fullName,
      phone: parsed.phone,
    });

    res.json({
      sent: true,
      email: parsed.email.trim(),
      simulatedOtpCode: otpCode,
      expiresInMinutes: 10,
    });
  });

  api.post('/auth/verify-otp', async (req, res) => {
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
      phone: parsed.phone,
    });

    if (!user) {
      throw new RuleViolationError('Invalid or expired verification code.', [
        {
          path: 'code',
          code: 'INVALID_OTP',
          message: 'That 6-digit code is incorrect or has expired.',
        },
      ]);
    }

    setSessionCookie(res, rawToken);
    res.json({ authenticated: true, user });
  });

  api.post('/auth/logout', async (req, res) => {
    const rawToken =
      typeof req.cookies?.[SESSION_COOKIE_NAME] === 'string'
        ? (req.cookies[SESSION_COOKIE_NAME] as string)
        : null;
    if (rawToken) {
      await store.deleteSession(sha256Hex(rawToken));
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(204).send();
  });

  api.get('/me', (req: RequestWithContext, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError('Please sign in from the profile menu to view your details.');
    }
    res.json({ user: req.currentUser });
  });

  api.patch('/me', async (req: RequestWithContext, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError();
    }
    const parsed = parseBody(UpdateProfileSchema, req.body);
    const updated = await store.updateUserProfile(req.currentUser.id, parsed);
    res.json({ user: updated });
  });

  api.get('/me/bookings', async (req: RequestWithContext, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError();
    }
    const list = await store.listBookingsForEmail(
      normalizeEmail(req.currentUser.email),
      clock.now(),
    );
    res.json({ bookings: list });
  });

  api.get('/me/contributions', async (req: RequestWithContext, res) => {
    if (!req.currentUser) {
      throw new UnauthorizedError();
    }
    const list = await store.listContributionsForEmail(normalizeEmail(req.currentUser.email));
    res.json({ contributions: list });
  });

  // Scheduled Maintenance (Cron)
  api.get('/cron/maintenance', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (cronSecret) {
      const auth = req.header('Authorization');
      if (auth !== `Bearer ${cronSecret}`) {
        throw new UnauthorizedError('Invalid cron secret.');
      }
    }
    const holdsReleased = await store.releaseExpiredHolds(clock.now());
    res.json({ holdsReleased, timestamp: clock.nowIso() });
  });

  app.use('/api', api);

  // Unknown API route handler
  app.use('/api', (_req, _res, next) => {
    next(new NotFoundError('API endpoint not found.'));
  });

  // Central Express 5 Error Handler
  app.use(
    (err: unknown, req: RequestWithContext, res: Response, _next: NextFunction): void => {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: err.message,
            requestId: req.requestId,
            issues: err.issues,
          },
        });
        return;
      }

      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({
          error: {
            code: 'MALFORMED_JSON',
            message: 'Request body contains malformed JSON.',
            requestId: req.requestId,
          },
        });
        return;
      }

      console.error(`[api-error] requestId=${req.requestId ?? 'unknown'}`, err);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected server error occurred. Please try again.',
          requestId: req.requestId,
        },
      });
    },
  );

  return app;
}
