import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCategoryMismatchMessage,
  classifyAge,
  computeAttendeeIdentityKey,
  FESTIVAL_DAYS,
  formatCategoryLabel,
  isValidAgeInteger,
  isValidEmail,
  isValidPhone,
  matchesSelectedCategory,
  normalizePersonName,
  normalizePhoneKey,
  requiresGuardian,
  type AttendeeCategoryChoice,
} from '@domain/index';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { SegmentedControl, type SegmentedOption } from '../../../ui/SegmentedControl';
import { FieldError, TextField } from '../../../ui/TextField';
import {
  changeAttendeeCategory,
  parseIntegerAge,
  type AttendeeDraft,
} from '../store/transitions';
import { ExtrasSelector } from './ExtrasSelector';
import { GuardianFields } from './GuardianFields';
import { PassDaySelector } from './PassDaySelector';

export interface AddAttendeeModalProps {
  open: boolean;
  initialAttendee?: AttendeeDraft | null;
  initialShowErrors?: boolean;
  existingAttendees?: readonly AttendeeDraft[];
  bookerQuickFill?: { name: string; phone: string } | null;
  onClose: () => void;
  onSave: (attendee: AttendeeDraft) => void;
}

const ATTENDEE_CATEGORIES: readonly SegmentedOption<AttendeeCategoryChoice>[] = [
  { value: 'adult', label: 'Adult', description: 'Ages 12+ · $15 / evening' },
  { value: 'child', label: 'Child', description: 'Ages 5–11 · $8 / evening' },
  { value: 'infant', label: 'Under 5 (free)', description: 'Ages 0–4 · Free' },
];

function createBlankAttendee(category: AttendeeCategoryChoice = 'adult'): AttendeeDraft {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `att-${crypto.randomUUID()}`
      : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    clientId: id,
    isBooker: false,
    selectedCategory: category,
    fullName: '',
    email: '',
    phone: '',
    ageInput: '',
    passKind: category === 'infant' ? 'free_infant' : 'day_pass',
    days: [FESTIVAL_DAYS[0]!.date],
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

export function AddAttendeeModal({
  open,
  initialAttendee,
  initialShowErrors = false,
  existingAttendees = [],
  bookerQuickFill,
  onClose,
  onSave,
}: AddAttendeeModalProps): React.ReactElement {
  const formId = React.useId();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<AttendeeDraft>(() => createBlankAttendee('adult'));
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAttempted(initialShowErrors);
    setForm(initialAttendee ? { ...initialAttendee } : createBlankAttendee('adult'));
    if (initialShowErrors) {
      window.requestAnimationFrame(() => {
        const firstInvalid = bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        if (firstInvalid) {
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstInvalid.focus({ preventScroll: true });
        }
      });
    }
  }, [open, initialAttendee, initialShowErrors]);

  const parsedAge = parseIntegerAge(form.ageInput);
  const hasAge = form.ageInput.trim().length > 0;
  const validIntAge = hasAge && isValidAgeInteger(parsedAge);

  const isCategoryMismatch =
    validIntAge && !matchesSelectedCategory(parsedAge, form.selectedCategory);
  let ageError: string | null = null;
  if (hasAge || attempted) {
    if (!hasAge) {
      ageError = 'Please enter the attendee’s age.';
    } else if (!isValidAgeInteger(parsedAge)) {
      ageError = 'Please enter a whole-number age between 0 and 120.';
    } else if (isCategoryMismatch) {
      ageError = buildCategoryMismatchMessage(parsedAge, form.selectedCategory);
    }
  }

  // Guardian required for Child (5–11), Under 5 (0–4), and 12–17 on Adult passes.
  const needsGuardian =
    form.selectedCategory === 'child' ||
    form.selectedCategory === 'infant' ||
    (validIntAge && requiresGuardian(parsedAge));

  // Uniqueness check against other attendees in this booking:
  // - Adult / 12–17 minor: unique attendee phone number
  // - Child / Under 5: unique combination of (guardian phone + attendee full name)
  const duplicateAttendee = useMemo(() => {
    const candidateKey = computeAttendeeIdentityKey({
      category: form.selectedCategory,
      fullName: form.fullName,
      phone: form.phone,
      guardianPhone: form.guardian.phone,
    });
    if (!candidateKey) return null;

    return (
      existingAttendees.find((other) => {
        if (other.clientId === form.clientId) return false;
        const otherKey = computeAttendeeIdentityKey({
          category: other.selectedCategory,
          fullName: other.fullName,
          phone: other.phone,
          guardianPhone: other.guardian.phone,
        });
        return otherKey === candidateKey;
      }) ?? null
    );
  }, [
    existingAttendees,
    form.clientId,
    form.selectedCategory,
    form.fullName,
    form.phone,
    form.guardian.phone,
  ]);

  const duplicateChildOrInfantError =
    form.selectedCategory !== 'adult' && duplicateAttendee
      ? `“${form.fullName.trim()}” is already added under guardian phone ${form.guardian.phone.trim()}. Use a different child’s name for a sibling pass.`
      : null;

  const nameError =
    attempted && form.fullName.trim().length < 2
      ? 'Please enter the attendee’s full name.'
      : duplicateChildOrInfantError;

  const phoneError = (() => {
    if (form.selectedCategory === 'adult') {
      if (attempted && form.phone.trim().length === 0) {
        return 'Phone number is required for adult passholders.';
      }
      if (form.phone.trim().length > 0 && !isValidPhone(form.phone)) {
        return 'Please enter a valid phone number (7–15 digits).';
      }
      if (duplicateAttendee) {
        const who = duplicateAttendee.fullName.trim() || 'the lead booker';
        return `This phone number is already used by ${who} in this booking. Each adult or minor (12+) passholder needs a unique phone number.`;
      }
      return null;
    }
    if (form.phone.trim().length > 0 && !isValidPhone(form.phone)) {
      return 'Please enter a valid phone number (7–15 digits).';
    }
    return null;
  })();

  const emailError =
    form.email.trim().length > 0 && !isValidEmail(form.email)
      ? 'Please enter a valid email address.'
      : null;

  const guardianNameError = (() => {
    if (!needsGuardian) return null;
    const gNameNorm = normalizePersonName(form.guardian.name);
    const attNameNorm = normalizePersonName(form.fullName);

    if (gNameNorm.length >= 2 && attNameNorm.length >= 2 && gNameNorm === attNameNorm) {
      return 'Guardian full name cannot be the same as the minor’s own name.';
    }
    if (gNameNorm.length >= 2) {
      const otherMinor = existingAttendees.find((other) => {
        if (other.clientId === form.clientId) return false;
        const otherAge = parseIntegerAge(other.ageInput);
        const isOtherMinor =
          other.selectedCategory !== 'adult' ||
          (isValidAgeInteger(otherAge) && requiresGuardian(otherAge));
        return isOtherMinor && normalizePersonName(other.fullName) === gNameNorm;
      });
      if (otherMinor) {
        return `Guardian must be an adult (18+), not a minor in this booking (${otherMinor.fullName.trim()}).`;
      }
    }
    if (attempted && form.guardian.name.trim().length < 2) {
      return 'Guardian full name is required before booking a pass for a minor.';
    }
    return null;
  })();

  const guardianPhoneError = (() => {
    if (!needsGuardian) return null;
    const gPhoneTrimmed = form.guardian.phone.trim();

    if (gPhoneTrimmed.length > 0 && !isValidPhone(gPhoneTrimmed)) {
      return 'Valid guardian phone number (7–15 digits) is required before booking a pass for a minor.';
    }
    if (isValidPhone(gPhoneTrimmed)) {
      const gKey = normalizePhoneKey(gPhoneTrimmed);
      if (form.phone.trim().length > 0 && isValidPhone(form.phone) && normalizePhoneKey(form.phone) === gKey) {
        return 'Guardian phone number cannot be the same as the minor’s own phone number.';
      }
      const otherMinorByPhone = existingAttendees.find((other) => {
        if (other.clientId === form.clientId) return false;
        const otherAge = parseIntegerAge(other.ageInput);
        const isOtherMinor =
          other.selectedCategory !== 'adult' ||
          (isValidAgeInteger(otherAge) && requiresGuardian(otherAge));
        return (
          isOtherMinor &&
          other.phone.trim().length > 0 &&
          isValidPhone(other.phone) &&
          normalizePhoneKey(other.phone) === gKey
        );
      });
      if (otherMinorByPhone) {
        return `Guardian phone belongs to a minor in this booking (${otherMinorByPhone.fullName.trim()}). Enter an adult guardian’s phone number.`;
      }
    }
    if (attempted && !isValidPhone(gPhoneTrimmed)) {
      return 'Valid guardian phone number (7–15 digits) is required before booking a pass for a minor.';
    }
    return null;
  })();

  const daysError =
    attempted &&
    (form.passKind === 'day_pass' || form.passKind === 'free_infant') &&
    form.days.length === 0
      ? 'Select at least one evening.'
      : null;

  const firstSubmitIssue = attempted
    ? (nameError ??
      ageError ??
      phoneError ??
      emailError ??
      guardianNameError ??
      guardianPhoneError ??
      daysError)
    : null;

  const handleCategorySwitch = (nextCat: AttendeeCategoryChoice): void => {
    setForm((prev) => changeAttendeeCategory(prev, nextCat, []));
  };

  const scrollFirstInvalidIntoView = (): void => {
    window.requestAnimationFrame(() => {
      const container = bodyRef.current;
      if (!container) return;
      const firstInvalid = container.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus({ preventScroll: true });
      } else {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setAttempted(true);

    if (
      form.fullName.trim().length < 2 ||
      !validIntAge ||
      isCategoryMismatch ||
      Boolean(duplicateAttendee) ||
      Boolean(phoneError) ||
      Boolean(emailError) ||
      Boolean(guardianNameError) ||
      Boolean(guardianPhoneError) ||
      (form.selectedCategory === 'adult' && !isValidPhone(form.phone)) ||
      (needsGuardian &&
        (form.guardian.name.trim().length < 2 || !isValidPhone(form.guardian.phone))) ||
      ((form.passKind === 'day_pass' || form.passKind === 'free_infant') &&
        form.days.length === 0)
    ) {
      scrollFirstInvalidIntoView();
      return;
    }

    onSave(form);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialAttendee ? 'Edit attendee' : 'Add attendee'}
      subtitle="Choose an age band and select the evenings they are attending"
      maxWidthClass="max-w-2xl"
      bodyRef={bodyRef}
      footer={
        <div className="space-y-3">
          {firstSubmitIssue && <FieldError message={firstSubmitIssue} />}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId}>
              {initialAttendee ? 'Save changes' : 'Add attendee'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="space-y-3">
          <SegmentedControl
            label="Attendee type"
            options={ATTENDEE_CATEGORIES}
            value={form.selectedCategory}
            onChange={handleCategorySwitch}
          />

          {/* Required UX: Age rules displayed right below the category selector */}
          <dl className="grid gap-2 rounded-control border border-white/10 px-4 py-3 text-xs text-white/65 sm:grid-cols-3">
            <div>
              <dt className="font-semibold text-cream">Under 5 (0–4)</dt>
              <dd>Free entry · guardian required</dd>
            </div>
            <div>
              <dt className="font-semibold text-cream">Child (5–11)</dt>
              <dd>Child pass · guardian required</dd>
            </div>
            <div>
              <dt className="font-semibold text-cream">Adult (12+)</dt>
              <dd>Adult pass · ages 12–17 need guardian</dd>
            </div>
          </dl>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            required
            placeholder="Arjun Patel"
            value={form.fullName}
            onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            error={nameError}
          />

          <div>
            <TextField
              label="Age (on 10 December 2026)"
              inputMode="numeric"
              required
              placeholder={
                form.selectedCategory === 'adult'
                  ? '32 or 15'
                  : form.selectedCategory === 'child'
                    ? '9'
                    : '3'
              }
              value={form.ageInput}
              onChange={(e) => setForm((p) => ({ ...p, ageInput: e.target.value }))}
              error={ageError}
            />
            {isCategoryMismatch && validIntAge && (
              <button
                type="button"
                onClick={() => handleCategorySwitch(classifyAge(parsedAge))}
                className="mt-2 cursor-pointer text-xs font-semibold text-bright-gold underline-offset-4 hover:underline"
              >
                Switch attendee type to {formatCategoryLabel(classifyAge(parsedAge))}
              </button>
            )}
          </div>

          {form.selectedCategory !== 'infant' && (
            <TextField
              label="Phone number"
              type="tel"
              optionalLabel={form.selectedCategory === 'child' ? 'Optional' : undefined}
              required={form.selectedCategory === 'adult'}
              placeholder="+1 469-555-0140"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              error={phoneError}
            />
          )}

          {form.selectedCategory === 'adult' && (
            <TextField
              label="Email address"
              type="email"
              optionalLabel="Optional"
              placeholder="guest@example.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              error={emailError}
            />
          )}
        </div>

        {needsGuardian && (
          <GuardianFields
            attendeeAgeLabel={
              form.selectedCategory === 'adult'
                ? `Age ${parsedAge} · minor on adult pass`
                : form.selectedCategory === 'child'
                  ? 'Ages 5–11'
                  : 'Under 5'
            }
            guardianName={form.guardian.name}
            guardianPhone={form.guardian.phone}
            onChange={(guardian) => setForm((p) => ({ ...p, guardian }))}
            bookerQuickFill={bookerQuickFill}
            nameError={guardianNameError}
            phoneError={guardianPhoneError}
          />
        )}

        <div className="border-t border-white/10 pt-5">
          <PassDaySelector
            category={form.selectedCategory}
            passKind={form.passKind}
            selectedDays={form.days}
            onChangePassKind={(passKind) => setForm((p) => ({ ...p, passKind }))}
            onChangeDays={(days) => setForm((p) => ({ ...p, days }))}
            error={daysError}
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-white/90">Optional add-ons</h3>
          <ExtrasSelector
            category={form.selectedCategory}
            passKind={form.passKind}
            selectedDays={form.days}
            extras={form.extras}
            onChangeExtras={(extras) => setForm((p) => ({ ...p, extras }))}
          />
        </div>
      </form>
    </Modal>
  );
}
