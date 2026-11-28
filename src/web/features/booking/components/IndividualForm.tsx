import React, { useState } from 'react';
import {
  isLegalAdultBooker,
  isValidAgeInteger,
  isValidEmail,
  isValidPhone,
} from '@domain/index';
import { Button } from '../../../ui/Button';
import { FormSection } from '../../../ui/FormSection';
import { FieldError, TextField } from '../../../ui/TextField';
import { useCatalogStore } from '../../../stores/catalog-store';
import { useBookingStore } from '../store/booking-store';
import { parseIntegerAge } from '../store/transitions';
import { ExtrasSelector } from './ExtrasSelector';
import { PassDaySelector } from './PassDaySelector';

export function IndividualForm(): React.ReactElement {
  const catalog = useCatalogStore((s) => s.catalog);
  const getProduct = useCatalogStore((s) => s.getProduct);
  const draft = useBookingStore((s) => s.draft);
  const quoteState = useBookingStore((s) => s.quoteState);
  const patchBooker = useBookingStore((s) => s.patchBooker);
  const updateAttendee = useBookingStore((s) => s.updateAttendee);
  const openCheckoutModal = useBookingStore((s) => s.openCheckoutModal);

  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const selfAttendee = draft.attendees[0]!;
  const selectedPassSoldOut =
    catalog !== null &&
    (selfAttendee.passKind === 'all_day'
      ? (getProduct('ALL_DAY_ADULT')?.availability.remaining ?? 0) <= 0
      : (getProduct('DAY_PASS_ADULT')?.availability.remaining ?? 0) <= 0);
  const parsedAge = parseIntegerAge(draft.booker.ageInput);
  const hasAgeTyped = draft.booker.ageInput.trim().length > 0;

  let ageError: string | null = null;
  if (hasAgeTyped || attemptedSubmit) {
    if (!hasAgeTyped) {
      ageError = 'Please enter your age.';
    } else if (!isValidAgeInteger(parsedAge)) {
      ageError = 'Please enter a whole-number age between 0 and 120.';
    } else if (!isLegalAdultBooker(parsedAge)) {
      ageError = `Booker is less than 18 (entered ${parsedAge}). Tickets must be booked by someone aged 18 or older.`;
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
      ? 'Select at least one evening.'
      : null;

  const isUnder18Blocked = hasAgeTyped && isValidAgeInteger(parsedAge) && parsedAge < 18;
  const stockIssues =
    quoteState.status === 'invalid'
      ? quoteState.issues.filter((iss) => iss.path.startsWith('stock.') || iss.path.includes('extras'))
      : [];

  const handleConfirm = (e: React.FormEvent): void => {
    e.preventDefault();
    setAttemptedSubmit(true);

    if (
      draft.booker.fullName.trim().length < 2 ||
      !isValidPhone(draft.booker.phone) ||
      !isValidEmail(draft.booker.email) ||
      !isLegalAdultBooker(parsedAge) ||
      (selfAttendee.passKind === 'day_pass' && selfAttendee.days.length === 0) ||
      selectedPassSoldOut ||
      stockIssues.length > 0
    ) {
      return;
    }

    openCheckoutModal();
  };

  return (
    <form onSubmit={handleConfirm} noValidate className="space-y-10">
      <FormSection
        step="1"
        title="Your details"
        description="You must be 18 or older to book. Your pass and receipt will be sent to this email address."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            required
            placeholder="Asha Patel"
            value={draft.booker.fullName}
            onChange={(e) => patchBooker({ fullName: e.target.value })}
            error={nameError}
          />
          <TextField
            label="Phone number"
            type="tel"
            required
            placeholder="+1 469-555-0140"
            value={draft.booker.phone}
            onChange={(e) => patchBooker({ phone: e.target.value })}
            error={phoneError}
          />
          <TextField
            label="Email address"
            type="email"
            required
            placeholder="asha@example.com"
            value={draft.booker.email}
            onChange={(e) => patchBooker({ email: e.target.value })}
            error={emailError}
          />
          <TextField
            label="Age (on 10 December 2026)"
            inputMode="numeric"
            required
            placeholder="28"
            value={draft.booker.ageInput}
            onChange={(e) => patchBooker({ ageInput: e.target.value })}
            hint="Bookers must be aged 18 or over"
            error={ageError}
          />
        </div>
      </FormSection>

      <FormSection
        step="2"
        title="Pass and evenings"
        description="Ages 12 and over are issued an adult festival pass."
      >
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
      </FormSection>

      <FormSection
        step="3"
        title="Add-ons"
        description="Optional meals, workshops and dandiya sticks printed on your pass."
      >
        <ExtrasSelector
          category="adult"
          passKind={selfAttendee.passKind}
          selectedDays={selfAttendee.days}
          extras={selfAttendee.extras}
          onChangeExtras={(extras) =>
            updateAttendee(selfAttendee.clientId, (prev) => ({ ...prev, extras }))
          }
        />
      </FormSection>

      {stockIssues.length > 0 && (
        <div className="space-y-1 rounded-card border border-error/70 bg-error/[0.06] px-5 py-4">
          {stockIssues.map((iss, idx) => (
            <FieldError key={`${iss.code}-${idx}`} message={iss.message} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
        <p className="text-xs text-white/55">
          You can enter a coupon code and choose your payment method in the next step.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={isUnder18Blocked || selectedPassSoldOut || stockIssues.length > 0}
        >
          Confirm and review pass
        </Button>
      </div>
    </form>
  );
}
