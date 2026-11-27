import {
  AuthSessionResponseSchema,
  BookingDetailResponseSchema,
  CreateBookingResponseSchema,
  EventCatalogResponseSchema,
  MyBookingsResponseSchema,
  MyContributionsResponseSchema,
  QuoteResponseSchema,
  RequestOtpResponseSchema,
  SimulatedEmailResponseSchema,
  SimulatePaymentResponseSchema,
  UserProfileSchema,
  type AuthSessionResponseDTO,
  type BookingDetailResponseDTO,
  type BookingIntentDTO,
  type CreateBookingRequestDTO,
  type CreateBookingResponseDTO,
  type EventCatalogResponseDTO,
  type MyBookingsResponseDTO,
  type MyContributionsResponseDTO,
  type QuoteResponseDTO,
  type RequestOtpDTO,
  type RequestOtpResponseDTO,
  type SimulatedEmailResponseDTO,
  type SimulatePaymentRequestDTO,
  type SimulatePaymentResponseDTO,
  type UpdateProfileDTO,
  type UserProfileDTO,
  type VerifyOtpDTO,
} from '@contract/index';
import { z } from 'zod';
import { httpClient } from './http';

export async function fetchEventCatalog(): Promise<EventCatalogResponseDTO> {
  const res = await httpClient.get('/event');
  return EventCatalogResponseSchema.parse(res.data);
}

export async function requestQuote(
  payload: BookingIntentDTO,
  signal?: AbortSignal,
): Promise<QuoteResponseDTO> {
  const res = await httpClient.post('/quote', payload, { signal });
  return QuoteResponseSchema.parse(res.data);
}

export async function createBooking(
  payload: CreateBookingRequestDTO,
  idempotencyKey: string,
): Promise<CreateBookingResponseDTO> {
  const res = await httpClient.post('/bookings', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return CreateBookingResponseSchema.parse(res.data);
}

export async function fetchBookingDetail(bookingId: string): Promise<BookingDetailResponseDTO> {
  const res = await httpClient.get(`/bookings/${bookingId}`);
  return BookingDetailResponseSchema.parse(res.data);
}

export async function submitSimulatedPayment(
  bookingId: string,
  payload: SimulatePaymentRequestDTO,
): Promise<SimulatePaymentResponseDTO> {
  const res = await httpClient.post(`/bookings/${bookingId}/simulate-pay`, payload);
  return SimulatePaymentResponseSchema.parse(res.data);
}

export async function fetchSimulatedEmail(
  bookingId: string,
): Promise<SimulatedEmailResponseDTO> {
  const res = await httpClient.get(`/bookings/${bookingId}/email`);
  return SimulatedEmailResponseSchema.parse(res.data);
}

export function getPassesPdfUrl(bookingId: string, attendeeId?: string): string {
  const base = `/api/bookings/${bookingId}/passes.pdf`;
  return attendeeId ? `${base}?attendeeId=${encodeURIComponent(attendeeId)}` : base;
}

export function getInvoicePdfUrl(bookingId: string): string {
  return `/api/bookings/${bookingId}/invoice.pdf`;
}

// Auth & Profile endpoints
export async function fetchAuthSession(): Promise<AuthSessionResponseDTO> {
  const res = await httpClient.get('/auth/session');
  return AuthSessionResponseSchema.parse(res.data);
}

export async function signInWithDemoProfile(): Promise<AuthSessionResponseDTO> {
  const res = await httpClient.post('/auth/demo');
  return AuthSessionResponseSchema.parse(res.data);
}

export async function requestEmailOtp(payload: RequestOtpDTO): Promise<RequestOtpResponseDTO> {
  const res = await httpClient.post('/auth/request-otp', payload);
  return RequestOtpResponseSchema.parse(res.data);
}

export async function verifyEmailOtp(payload: VerifyOtpDTO): Promise<AuthSessionResponseDTO> {
  const res = await httpClient.post('/auth/verify-otp', payload);
  return AuthSessionResponseSchema.parse(res.data);
}

export async function signOutProfile(): Promise<void> {
  await httpClient.post('/auth/logout');
}

export async function updateMyProfile(payload: UpdateProfileDTO): Promise<UserProfileDTO> {
  const res = await httpClient.patch('/me', payload);
  return z.object({ user: UserProfileSchema }).parse(res.data).user;
}

export async function fetchMyBookings(): Promise<MyBookingsResponseDTO> {
  const res = await httpClient.get('/me/bookings');
  return MyBookingsResponseSchema.parse(res.data);
}

export async function fetchMyContributions(): Promise<MyContributionsResponseDTO> {
  const res = await httpClient.get('/me/contributions');
  return MyContributionsResponseSchema.parse(res.data);
}
