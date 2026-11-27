import { create } from 'zustand';
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  ApiIssueDTO,
  BookingDetailResponseDTO,
  QuoteResponseDTO,
} from '@contract/index';
import type { AttendeeCategoryChoice, BookingMode, PaymentMethodChoice } from '@domain/index';
import {
  changeAttendeeCategory,
  createInitialDraftState,
  reconcileAttendeeExtras,
  switchBookingMode,
  updateBookerFields,
  type AttendeeDraft,
  type BookerDraft,
  type BookingDraftState,
} from './transitions';

export type QuoteSyncState =
  | { status: 'idle' }
  | { status: 'loading'; forVersion: number }
  | { status: 'ready'; quote: QuoteResponseDTO; forVersion: number }
  | { status: 'invalid'; issues: readonly ApiIssueDTO[]; forVersion: number }
  | { status: 'error'; message: string };

interface ActiveHoldState {
  idempotencyKey: string;
  bookingId?: string;
  reference?: string;
  holdExpiresAt?: string;
}

interface BookModalState {
  open: boolean;
  stage: 'checkout' | 'confirmed';
  confirmedBooking: BookingDetailResponseDTO | null;
}

export interface BookingStoreState {
  draft: BookingDraftState;
  draftVersion: number;
  quoteState: QuoteSyncState;
  activeHold: ActiveHoldState | null;
  bookModal: BookModalState;

  // Draft mutations
  setMode: (mode: BookingMode) => void;
  patchBooker: (patch: Partial<BookerDraft>) => void;
  prefillBookerFromProfile: (profile: { fullName: string; email: string; phone: string }) => void;
  addAttendee: (attendee: AttendeeDraft) => void;
  updateAttendee: (clientId: string, updater: (prev: AttendeeDraft) => AttendeeDraft) => void;
  setAttendeeCategory: (clientId: string, category: AttendeeCategoryChoice) => void;
  removeAttendee: (clientId: string) => void;
  applyFamilyPassForDay: (date: string, memberClientIds: string[]) => void;
  clearFamilyPass: () => void;
  setPromoCode: (promoCode: string) => void;
  setPaymentMethod: (method: PaymentMethodChoice) => void;

  // Quote & checkout lifecycle
  setQuoteState: (next: QuoteSyncState) => void;
  openCheckoutModal: () => void;
  openConfirmedModal: (booking: BookingDetailResponseDTO) => void;
  closeBookModal: () => void;
  ensureIdempotencyKey: () => string;
  recordHoldCreated: (hold: { bookingId: string; reference: string; holdExpiresAt: string }) => void;
  resetDraftAfterCompletion: () => void;
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `su26-${crypto.randomUUID()}`;
  }
  return `su26-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useBookingStore = create<BookingStoreState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          draft: createInitialDraftState(),
          draftVersion: 1,
          quoteState: { status: 'idle' },
          activeHold: null,
          bookModal: {
            open: false,
            stage: 'checkout',
            confirmedBooking: null,
          },

          setMode: (mode) =>
            set((s) => ({
              draft: switchBookingMode(s.draft, mode),
              draftVersion: s.draftVersion + 1,
              activeHold: null,
            })),

          patchBooker: (patch) =>
            set((s) => ({
              draft: updateBookerFields(s.draft, patch),
              draftVersion: s.draftVersion + 1,
              activeHold: null,
            })),

          prefillBookerFromProfile: (profile) =>
            set((s) => {
              if (s.draft.booker.email.trim() !== '') return s;
              return {
                draft: updateBookerFields(s.draft, {
                  fullName: profile.fullName,
                  email: profile.email,
                  phone: profile.phone,
                }),
                draftVersion: s.draftVersion + 1,
              };
            }),

          addAttendee: (attendee) =>
            set((s) => ({
              draft: {
                ...s.draft,
                attendees: [
                  ...s.draft.attendees,
                  reconcileAttendeeExtras(attendee, s.draft.familyGroups),
                ],
              },
              draftVersion: s.draftVersion + 1,
              activeHold: null,
            })),

          updateAttendee: (clientId, updater) =>
            set((s) => {
              const nextAttendees = s.draft.attendees.map((att) => {
                if (att.clientId !== clientId) return att;
                const updated = reconcileAttendeeExtras(updater(att), s.draft.familyGroups);
                return updated;
              });

              // Keep booker synced if booker's own attendee card was updated
              const selfAtt = nextAttendees.find((a) => a.isBooker);
              const nextBooker = selfAtt
                ? {
                    ...s.draft.booker,
                    fullName: selfAtt.fullName,
                    email: selfAtt.email,
                    phone: selfAtt.phone,
                    ageInput: selfAtt.ageInput,
                  }
                : s.draft.booker;

              return {
                draft: {
                  ...s.draft,
                  booker: nextBooker,
                  attendees: nextAttendees,
                },
                draftVersion: s.draftVersion + 1,
                activeHold: null,
              };
            }),

          setAttendeeCategory: (clientId, category) =>
            set((s) => ({
              draft: {
                ...s.draft,
                attendees: s.draft.attendees.map((att) =>
                  att.clientId === clientId
                    ? changeAttendeeCategory(att, category, s.draft.familyGroups)
                    : att,
                ),
              },
              draftVersion: s.draftVersion + 1,
              activeHold: null,
            })),

          removeAttendee: (clientId) =>
            set((s) => {
              const filtered = s.draft.attendees.filter((a) => a.clientId !== clientId);
              const remainingGroupMembers = filtered.filter((a) => a.familyGroupId === 'fg-main');
              const shouldClearFamily = remainingGroupMembers.length < 2;

              const cleanedAttendees = shouldClearFamily
                ? filtered.map((a) =>
                    a.familyGroupId === 'fg-main'
                      ? reconcileAttendeeExtras(
                          {
                            ...a,
                            passKind: a.selectedCategory === 'infant' ? 'free_infant' : 'day_pass',
                            familyGroupId: undefined,
                          },
                          [],
                        )
                      : a,
                  )
                : filtered;

              return {
                draft: {
                  ...s.draft,
                  attendees: cleanedAttendees,
                  familyGroups: shouldClearFamily ? [] : s.draft.familyGroups,
                },
                draftVersion: s.draftVersion + 1,
                activeHold: null,
              };
            }),

          applyFamilyPassForDay: (date, memberClientIds) =>
            set((s) => {
              const memberSet = new Set(memberClientIds);
              const group = { id: 'fg-main', days: [date] };
              const nextAttendees = s.draft.attendees.map((att) =>
                memberSet.has(att.clientId) && att.selectedCategory !== 'infant'
                  ? reconcileAttendeeExtras(
                      {
                        ...att,
                        passKind: 'family_pass',
                        days: [date],
                        familyGroupId: 'fg-main',
                      },
                      [group],
                    )
                  : att.familyGroupId === 'fg-main'
                    ? reconcileAttendeeExtras(
                        {
                          ...att,
                          passKind: 'day_pass',
                          familyGroupId: undefined,
                        },
                        [group],
                      )
                    : att,
              );
              return {
                draft: {
                  ...s.draft,
                  familyGroups: [group],
                  attendees: nextAttendees,
                },
                draftVersion: s.draftVersion + 1,
                activeHold: null,
              };
            }),

          clearFamilyPass: () =>
            set((s) => ({
              draft: {
                ...s.draft,
                familyGroups: [],
                attendees: s.draft.attendees.map((att) =>
                  att.familyGroupId
                    ? reconcileAttendeeExtras(
                        {
                          ...att,
                          passKind: att.selectedCategory === 'infant' ? 'free_infant' : 'day_pass',
                          familyGroupId: undefined,
                        },
                        [],
                      )
                    : att,
                ),
              },
              draftVersion: s.draftVersion + 1,
              activeHold: null,
            })),

          setPromoCode: (promoCode) =>
            set((s) => ({
              draft: { ...s.draft, promoCode },
              draftVersion: s.draftVersion + 1,
              activeHold: null,
            })),

          setPaymentMethod: (paymentMethod) =>
            set((s) => ({
              draft: { ...s.draft, paymentMethod },
            })),

          setQuoteState: (quoteState) => set({ quoteState }),

          openCheckoutModal: () =>
            set({
              bookModal: {
                open: true,
                stage: 'checkout',
                confirmedBooking: null,
              },
            }),

          openConfirmedModal: (booking) =>
            set({
              bookModal: {
                open: true,
                stage: 'confirmed',
                confirmedBooking: booking,
              },
            }),

          closeBookModal: () =>
            set((s) => ({
              bookModal: {
                ...s.bookModal,
                open: false,
              },
            })),

          ensureIdempotencyKey: () => {
            const existing = get().activeHold?.idempotencyKey;
            if (existing) return existing;
            const key = makeIdempotencyKey();
            set({ activeHold: { idempotencyKey: key } });
            return key;
          },

          recordHoldCreated: (hold) =>
            set((s) => ({
              activeHold: {
                idempotencyKey: s.activeHold?.idempotencyKey ?? makeIdempotencyKey(),
                ...hold,
              },
            })),

          resetDraftAfterCompletion: () =>
            set((s) => ({
              draft: createInitialDraftState(),
              draftVersion: s.draftVersion + 1,
              quoteState: { status: 'idle' },
              activeHold: null,
              bookModal: { open: false, stage: 'checkout', confirmedBooking: null },
            })),
        }),
        {
          name: 'sharad-utsav-booking-v1',
          storage: createJSONStorage(() => sessionStorage),
          partialize: (s) => ({
            draft: s.draft,
            draftVersion: s.draftVersion,
            activeHold: s.activeHold,
          }),
        },
      ),
    ),
    { name: 'SharadUtsavBookingStore' },
  ),
);
