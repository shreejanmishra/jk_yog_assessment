import { z } from 'zod';
import { BookingDetailResponseSchema } from './booking.schema';

export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string(),
  createdAt: z.string(),
});

export const RequestOtpSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
});

export const RequestOtpResponseSchema = z.object({
  sent: z.boolean(),
  email: z.string().email(),
  simulatedOtpCode: z.string(),
  expiresInMinutes: z.number().int().positive(),
});

export const VerifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().length(6),
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional(),
});

export const AuthSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: UserProfileSchema.nullable(),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
});

export const ContributionCardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  organization: z.string(),
  category: z.enum(['charity', 'seva', 'event']),
  amountCents: z.number().int().nonnegative().nullable(),
  contributedOn: z.string(),
  summary: z.string(),
  impactBadge: z.string(),
});

export const MyContributionsResponseSchema = z.object({
  contributions: z.array(ContributionCardSchema),
});

export const MyBookingsResponseSchema = z.object({
  bookings: z.array(BookingDetailResponseSchema),
});

export type UserProfileDTO = z.infer<typeof UserProfileSchema>;
export type RequestOtpDTO = z.infer<typeof RequestOtpSchema>;
export type RequestOtpResponseDTO = z.infer<typeof RequestOtpResponseSchema>;
export type VerifyOtpDTO = z.infer<typeof VerifyOtpSchema>;
export type AuthSessionResponseDTO = z.infer<typeof AuthSessionResponseSchema>;
export type UpdateProfileDTO = z.infer<typeof UpdateProfileSchema>;
export type ContributionCardDTO = z.infer<typeof ContributionCardSchema>;
export type MyContributionsResponseDTO = z.infer<typeof MyContributionsResponseSchema>;
export type MyBookingsResponseDTO = z.infer<typeof MyBookingsResponseSchema>;
