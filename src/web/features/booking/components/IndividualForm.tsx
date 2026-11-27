import React, { useState } from 'react';
import {
  isLegalAdultBooker,
  isValidAgeInteger,
  isValidEmail,
  isValidPhone,
} from '@domain/index';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { TextField } from '../../../ui/TextField';
import { useBookingStore } from '../store/booking-store';
import { parseIntegerAge } from '../store/transitions';
import { ExtrasSelector } from './ExtrasSelector';
import { PassDaySelector } from './PassDaySelector';

export function IndividualForm(): React.ReactElement {
  const draft = useBookingStore((s) => s.draft);
  const patchBooker = useBookingStore((s) => s.patchBooker);
  const updateAttendee = useBookingStore((s) => s.updateAttendee);
  const openCheckoutModal = useBookingStore((s) => s.openCheckoutModal);

  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const selfAttendee = draft.attendees[0]!;
  const parsedAge = parseIntegerAge(draft.booker.ageInput);
  const hasAgeTyped = draft.booker.ageInput.trim().length > 0;

  let ageError: string | null = null;
  if (hasAgeTyped || attemptedSubmit) {
    if (!hasAgeTyped) {
      ageError = 'Please enter your age.';
    } else if (!isValidAgeInteger(parsedAge)) {
      ageError = 'Please enter a valid whole-number age between 0 and 120.';
    } else if (!isLegalAdultBooker(parsedAge)) {
      ageError = `Booker is less than 18 (entered ${parsedAge}). You must be 18 or older to book tickets.`;
    }
  }

  const nameError =
    attemptedSubmit && draft.booker.fullName.trim().length < 2
      ? 'Please enter your full name.'
      : null;
  const phoneError =
    attemptedSubmit && !isValidPhone(draft.booker.phone)
      ? 'Please enter a valid phone number (7–15 digits).'
      : null;
  const emailError =
    attemptedSubmit && !isValidEmail(draft.booker.email)
      ? 'Please enter a valid email address.'
      : null;
  const daysError =
    attemptedSubmit &&
    selfAttendee.passKind === 'day_pass' &&
    selfAttendee.days.length === 0
      ? 'Select at least one festival day.'
      : null;

  const isUnder18Blocked = hasAgeTyped && isValidAgeInteger(parsedAge) && parsedAge < 18;

  const handleConfirm = (e: React.FormEvent): void => {
    e.preventDefault();
    setAttemptedSubmit(true);

    if (
      draft.booker.fullName.trim().length < 2 ||
      !isValidPhone(draft.booker.phone) ||
      !isValidEmail(draft.booker.email) ||
      !isLegalAdultBooker(parsedAge) ||
      (selfAttendee.passKind === 'day_pass' && selfAttendee.days.length === 0)
    ) {
      return;
    }

    openCheckoutModal();
  };

  return (
    <Card className="p-5 sm:p-8">
      <form onSubmit={handleConfirm} noValidate className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#FDF3E4]">
            Individual Booker Details
          </h2>
          <p className="mt-1 text-sm text-white/70">
            Booker must be 18 or older. Ages 12+ receive an Adult Festival Pass.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Full Name"
            required
            placeholder="Asha Patel"
            value={draft.booker.fullName}
            onChange={(e) => patchBooker({ fullName: e.target.value })}
            error={nameError}
          />
          <TextField
            label="Phone Number"
            type="tel"
            required
            placeholder="+1 469-555-0140"
            value={draft.booker.phone}
            onChange={(e) => patchBooker({ phone: e.target.value })}
            error={phoneError}
          />
          <TextField
            label="Email Address"
            type="email"
            required
            placeholder="asha@example.com"
            value={draft.booker.email}
            onChange={(e) => patchBooker({ email: e.target.value })}
            error={emailError}
          />
          <TextField
            label="Age (as of 10 Dec 2026)"
            inputMode="numeric"
            required
            placeholder="e.g. 28"
            value={draft.booker.ageInput}
            onChange={(e) => patchBooker({ ageInput: e.target.value })}
            hint="Booker must be 18 or older"
            error={ageError}
          />
        </div>

        <PassDaySelector
          category="adult"
          passKind={selfAttendee.passKind}
          selectedDays={selfAttendee.days}
          onChangePassKind={(kind) =>
            updateAttendee(selfAttendee.clientId, (prev) => ({ ...prev, passKind: kind }))
          }
          onChangeDays={(days) =>
            updateAttendee(selfAttendee.clientId, (prev) => ({ ...prev, days }))
          }
          error={daysError}
        />

        <ExtrasSelector
          category="adult"
          passKind={selfAttendee.passKind}
          selectedDays={selfAttendee.days}
          extras={selfAttendee.extras}
          onChangeExtras={(extras) =>
            updateAttendee(selfAttendee.clientId, (prev) => ({ ...prev, extras }))
          }
        />

        <div className="pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-white/65">
            Final amount and coupon discounts are verified on the server in the next step.
          </p>
          <Button type="submit" variant="primary" size="lg" disabled={isUnder18Blocked}>
            Confirm & Review Pass
          </Button>
        </div>
      </form>
    </Card>
  );
}
