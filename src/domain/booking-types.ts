import type { AttendeeCategoryChoice } from './age';

export type BookingMode = 'individual' | 'group';
export type PassKind = 'day_pass' | 'all_day' | 'family_pass' | 'free_infant';
export type PaymentMethodChoice = 'card' | 'stripe';

export interface GuardianInfo {
  readonly name: string;
  readonly phone: string;
}

export interface AttendeeExtrasIntent {
  readonly dandiyaPairs: number;
  readonly dinnerDates: readonly string[];
  readonly workshopDates: readonly string[];
}

export interface AttendeeIntent {
  readonly clientId: string;
  readonly isBooker: boolean;
  readonly selectedCategory: AttendeeCategoryChoice;
  readonly fullName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly age: number;
  readonly passKind: PassKind;
  readonly days: readonly string[];
  readonly familyGroupId?: string;
  readonly extras: AttendeeExtrasIntent;
  readonly guardian?: GuardianInfo;
}

export interface FamilyGroupIntent {
  readonly id: string;
  readonly days: readonly string[];
}

export interface BookerIntent {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly age: number;
  readonly isAttending: boolean;
}

export interface BookingIntent {
  readonly mode: BookingMode;
  readonly booker: BookerIntent;
  readonly attendees: readonly AttendeeIntent[];
  readonly familyGroups: readonly FamilyGroupIntent[];
  readonly promoCode?: string;
}
