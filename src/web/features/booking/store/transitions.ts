import type { BookingIntentDTO } from '@contract/index';
import {
  FESTIVAL_DAYS,
  GARBA_WORKSHOP_DATES,
  type AttendeeCategoryChoice,
  type BookingMode,
  type FamilyGroupIntent,
  type PassKind,
  type PaymentMethodChoice,
} from '@domain/index';

export interface AttendeeDraft {
  readonly clientId: string;
  readonly isBooker: boolean;
  readonly selectedCategory: AttendeeCategoryChoice;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly ageInput: string;
  readonly passKind: PassKind;
  readonly days: readonly string[];
  readonly familyGroupId?: string;
  readonly extras: {
    readonly dandiyaPairs: number;
    readonly dinnerDates: readonly string[];
    readonly workshopDates: readonly string[];
  };
  readonly guardian: {
    readonly name: string;
    readonly phone: string;
  };
}

export interface BookerDraft {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly ageInput: string;
  readonly isAttending: boolean;
}

export interface BookingDraftState {
  readonly mode: BookingMode;
  readonly booker: BookerDraft;
  readonly attendees: readonly AttendeeDraft[];
  readonly familyGroups: readonly FamilyGroupIntent[];
  readonly promoCode: string;
  readonly paymentMethod: PaymentMethodChoice;
}

const DEFAULT_FIRST_DAY = FESTIVAL_DAYS[0]!.date;
const ALL_FESTIVAL_DATES = FESTIVAL_DAYS.map((d) => d.date);
const WORKSHOP_SET = new Set(GARBA_WORKSHOP_DATES);

export function createBookerAttendeeDraft(booker: BookerDraft): AttendeeDraft {
  return {
    clientId: 'booker-self',
    isBooker: true,
    selectedCategory: 'adult',
    fullName: booker.fullName,
    email: booker.email,
    phone: booker.phone,
    ageInput: booker.ageInput,
    passKind: 'day_pass',
    days: [DEFAULT_FIRST_DAY],
    extras: {
      dandiyaPairs: 0,
      dinnerDates: [],
      workshopDates: [],
    },
    guardian: {
      name: '',
      phone: '',
    },
  };
}

export function createInitialDraftState(): BookingDraftState {
  const booker: BookerDraft = {
    fullName: '',
    email: '',
    phone: '',
    ageInput: '',
    isAttending: true,
  };
  return {
    mode: 'individual',
    booker,
    attendees: [createBookerAttendeeDraft(booker)],
    familyGroups: [],
    promoCode: '',
    paymentMethod: 'card',
  };
}

function computeEffectiveDatesForAttendee(
  attendee: AttendeeDraft,
  familyGroups: readonly FamilyGroupIntent[],
): Set<string> {
  if (attendee.passKind === 'all_day') {
    return new Set(ALL_FESTIVAL_DATES);
  }
  if (attendee.passKind === 'family_pass' && attendee.familyGroupId) {
    const group = familyGroups.find((g) => g.id === attendee.familyGroupId);
    return new Set(group?.days ?? []);
  }
  return new Set(attendee.days);
}

/**
 * Prunes any dinner or workshop dates that are no longer valid when an attendee's
 * pass kind, category, or selected days change.
 */
export function reconcileAttendeeExtras(
  attendee: AttendeeDraft,
  familyGroups: readonly FamilyGroupIntent[],
): AttendeeDraft {
  const validDates = computeEffectiveDatesForAttendee(attendee, familyGroups);
  const prunedDinners = attendee.extras.dinnerDates.filter((d) => validDates.has(d));
  const prunedWorkshops =
    attendee.selectedCategory === 'infant'
      ? []
      : attendee.extras.workshopDates.filter((d) => validDates.has(d) && WORKSHOP_SET.has(d));

  return {
    ...attendee,
    extras: {
      ...attendee.extras,
      dinnerDates: prunedDinners,
      workshopDates: prunedWorkshops,
    },
  };
}

export function switchBookingMode(
  state: BookingDraftState,
  nextMode: BookingMode,
): BookingDraftState {
  if (state.mode === nextMode) return state;

  if (nextMode === 'individual') {
    const updatedBooker: BookerDraft = { ...state.booker, isAttending: true };
    const existingSelf = state.attendees.find((a) => a.isBooker);
    const selfDraft: AttendeeDraft = existingSelf
      ? reconcileAttendeeExtras(
          {
            ...existingSelf,
            selectedCategory: 'adult',
            fullName: updatedBooker.fullName,
            email: updatedBooker.email,
            phone: updatedBooker.phone,
            ageInput: updatedBooker.ageInput,
            passKind: existingSelf.passKind === 'family_pass' ? 'day_pass' : existingSelf.passKind,
            days: existingSelf.days.length > 0 ? existingSelf.days : [DEFAULT_FIRST_DAY],
            familyGroupId: undefined,
          },
          [],
        )
      : createBookerAttendeeDraft(updatedBooker);

    return {
      ...state,
      mode: 'individual',
      booker: updatedBooker,
      attendees: [selfDraft],
      familyGroups: [],
    };
  }

  return {
    ...state,
    mode: 'group',
  };
}

export function updateBookerFields(
  state: BookingDraftState,
  patch: Partial<BookerDraft>,
): BookingDraftState {
  const nextBooker: BookerDraft = {
    ...state.booker,
    ...patch,
    isAttending: state.mode === 'individual' ? true : (patch.isAttending ?? state.booker.isAttending),
  };

  let nextAttendees = [...state.attendees];
  const selfIdx = nextAttendees.findIndex((a) => a.isBooker);

  if (nextBooker.isAttending) {
    if (selfIdx >= 0) {
      const existing = nextAttendees[selfIdx]!;
      nextAttendees[selfIdx] = {
        ...existing,
        fullName: nextBooker.fullName,
        email: nextBooker.email,
        phone: nextBooker.phone,
        ageInput: nextBooker.ageInput,
      };
    } else {
      nextAttendees = [createBookerAttendeeDraft(nextBooker), ...nextAttendees];
    }
  } else if (selfIdx >= 0) {
    nextAttendees.splice(selfIdx, 1);
  }

  return {
    ...state,
    booker: nextBooker,
    attendees: nextAttendees,
  };
}

export function changeAttendeeCategory(
  attendee: AttendeeDraft,
  nextCategory: AttendeeCategoryChoice,
  familyGroups: readonly FamilyGroupIntent[],
): AttendeeDraft {
  const defaultPassKind: PassKind = nextCategory === 'infant' ? 'free_infant' : 'day_pass';
  const days = attendee.days.length > 0 ? attendee.days : [DEFAULT_FIRST_DAY];

  return reconcileAttendeeExtras(
    {
      ...attendee,
      selectedCategory: nextCategory,
      passKind: defaultPassKind,
      days,
      familyGroupId: undefined,
    },
    familyGroups,
  );
}

export function parseIntegerAge(ageInput: string): number {
  const trimmed = ageInput.trim();
  if (trimmed === '') return Number.NaN;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : Number.NaN;
}

export function draftToBookingIntent(state: BookingDraftState): BookingIntentDTO {
  return {
    mode: state.mode,
    booker: {
      fullName: state.booker.fullName,
      email: state.booker.email,
      phone: state.booker.phone,
      age: parseIntegerAge(state.booker.ageInput),
      isAttending: state.booker.isAttending,
    },
    attendees: state.attendees.map((a) => ({
      clientId: a.clientId,
      isBooker: a.isBooker,
      selectedCategory: a.selectedCategory,
      fullName: a.fullName,
      email: a.email.trim() || undefined,
      phone: a.phone.trim() || undefined,
      age: parseIntegerAge(a.ageInput),
      passKind: a.passKind,
      days: [...a.days],
      familyGroupId: a.familyGroupId,
      extras: {
        dandiyaPairs: a.extras.dandiyaPairs,
        dinnerDates: [...a.extras.dinnerDates],
        workshopDates: [...a.extras.workshopDates],
      },
      guardian:
        a.guardian.name.trim() || a.guardian.phone.trim()
          ? { name: a.guardian.name, phone: a.guardian.phone }
          : undefined,
    })),
    familyGroups: state.familyGroups.map((fg) => ({
      id: fg.id,
      days: [...fg.days],
    })),
    promoCode: state.promoCode.trim() || undefined,
  };
}
