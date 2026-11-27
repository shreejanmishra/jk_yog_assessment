import { describe, expect, it } from 'vitest';
import {
  changeAttendeeCategory,
  createInitialDraftState,
  reconcileAttendeeExtras,
  switchBookingMode,
  updateBookerFields,
} from '@web/features/booking/store/transitions';

describe('Zustand booking transitions — keeping attendees and tickets synced', () => {
  it('syncs booker fields into attendee #1 and toggles attendance cleanly in Group mode', () => {
    let state = createInitialDraftState();
    state = updateBookerFields(state, {
      fullName: 'Priya Iyer',
      email: 'priya@example.com',
      phone: '+1 469-555-0133',
      ageInput: '31',
    });

    expect(state.attendees).toHaveLength(1);
    expect(state.attendees[0]?.fullName).toBe('Priya Iyer');
    expect(state.attendees[0]?.ageInput).toBe('31');

    // Switch to group and toggle booker isAttending off -> removes booker from attendees
    state = switchBookingMode(state, 'group');
    state = updateBookerFields(state, { isAttending: false });
    expect(state.attendees).toHaveLength(0);

    // Toggle back on -> restores booker as attendee #1
    state = updateBookerFields(state, { isAttending: true });
    expect(state.attendees).toHaveLength(1);
    expect(state.attendees[0]?.isBooker).toBe(true);
  });

  it('automatically prunes dinner and workshop dates when pass dates are deselected or switched to Under 5', () => {
    const initial = createInitialDraftState().attendees[0]!;
    const withExtras = {
      ...initial,
      days: ['2026-12-10', '2026-12-11'],
      extras: {
        dandiyaPairs: 2,
        dinnerDates: ['2026-12-10', '2026-12-11'],
        workshopDates: ['2026-12-11'],
      },
    };

    // Deselect Dec 11 -> removes Dec 11 dinner AND Dec 11 Garba Workshop automatically
    const afterDeselect = reconcileAttendeeExtras(
      { ...withExtras, days: ['2026-12-10'] },
      [],
    );
    expect(afterDeselect.extras.dinnerDates).toEqual(['2026-12-10']);
    expect(afterDeselect.extras.workshopDates).toEqual([]);

    // Switch category to Under 5 -> sets passKind to free_infant and removes workshop dates
    const asInfant = changeAttendeeCategory(withExtras, 'infant', []);
    expect(asInfant.passKind).toBe('free_infant');
    expect(asInfant.extras.workshopDates).toEqual([]);
    expect(asInfant.extras.dinnerDates).toEqual(['2026-12-10', '2026-12-11']);
  });
});
