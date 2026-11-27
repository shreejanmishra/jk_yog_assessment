import type {
  BookingDetailResponseDTO,
  ContributionCardDTO,
  CreateBookingResponseDTO,
  SimulatedEmailResponseDTO,
  UserProfileDTO,
} from '@contract/index';
import type {
  BookingMode,
  BookerIntent,
  CatalogProduct,
  PaymentMethodChoice,
  PricedQuote,
  PriorPromoRedemptionMatch,
  PromoDefinition,
  PromoParticipant,
} from '@domain/index';

export interface CreateHoldInput {
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly userId: string | null;
  readonly mode: BookingMode;
  readonly booker: BookerIntent;
  readonly paymentMethod: PaymentMethodChoice;
  readonly quote: PricedQuote;
  readonly now: Date;
}

export interface ConfirmPaymentInput {
  readonly bookingId: string;
  readonly outcome: 'success' | 'decline' | 'cancel';
  readonly method: PaymentMethodChoice;
  readonly cardLast4?: string;
  readonly now: Date;
}

export interface BookingDataStore {
  getCatalogAndPromos(): Promise<{
    products: CatalogProduct[];
    promos: PromoDefinition[];
  }>;

  releaseExpiredHolds(now: Date): Promise<number>;

  findPriorPromoRedemption(
    participants: readonly PromoParticipant[],
    now: Date,
  ): Promise<PriorPromoRedemptionMatch | null>;

  createBookingHold(input: CreateHoldInput): Promise<CreateBookingResponseDTO>;

  processSimulatedPayment(input: ConfirmPaymentInput): Promise<{
    bookingId: string;
    reference: string;
    status: 'pending_payment' | 'confirmed' | 'cancelled';
  }>;

  getBookingDetail(bookingId: string, now: Date): Promise<BookingDetailResponseDTO | null>;

  getSimulatedEmail(bookingId: string): Promise<SimulatedEmailResponseDTO | null>;

  // Optional profile & simulated OTP auth
  createOrRefreshOtp(params: {
    email: string;
    codeHash: string;
    expiresAt: Date;
    fullName?: string;
    phone?: string;
  }): Promise<void>;

  verifyOtpAndCreateSession(params: {
    email: string;
    codeHash: string;
    sessionTokenHash: string;
    sessionExpiresAt: Date;
    now: Date;
    fullName?: string;
    phone?: string;
  }): Promise<UserProfileDTO | null>;

  createDemoSession(params: {
    sessionTokenHash: string;
    sessionExpiresAt: Date;
  }): Promise<UserProfileDTO>;

  getUserBySessionToken(tokenHash: string, now: Date): Promise<UserProfileDTO | null>;

  deleteSession(tokenHash: string): Promise<void>;

  updateUserProfile(
    userId: string,
    updates: { fullName: string; phone: string },
  ): Promise<UserProfileDTO>;

  listBookingsForEmail(emailNormalized: string, now: Date): Promise<BookingDetailResponseDTO[]>;

  listContributionsForEmail(emailNormalized: string): Promise<ContributionCardDTO[]>;

  resetInventoryToDefaults(): Promise<void>;
}
