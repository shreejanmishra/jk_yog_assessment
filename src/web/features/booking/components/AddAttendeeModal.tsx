import React, { useEffect, useState } from 'react';
import {
  buildCategoryMismatchMessage,
  classifyAge,
  FESTIVAL_DAYS,
  formatCategoryLabel,
  isValidAgeInteger,
  isValidEmail,
  isValidPhone,
  matchesSelectedCategory,
  requiresGuardian,
  type AttendeeCategoryChoice,
} from '@domain/index';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { TextField } from '../../../ui/TextField';
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
  bookerQuickFill?: { name: string; phone: string } | null;
  onClose: () => void;
  onSave: (attendee: AttendeeDraft) => void;
}

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
  bookerQuickFill,
  onClose,
  onSave,
}: AddAttendeeModalProps): React.ReactElement {
  const [form, setForm] = useState<AttendeeDraft>(() => createBlankAttendee('adult'));
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAttempted(false);
    setForm(initialAttendee ? { ...initialAttendee } : createBlankAttendee('adult'));
  }, [open, initialAttendee]);

  const parsedAge = parseIntegerAge(form.ageInput);
  const hasAge = form.ageInput.trim().length > 0;
  const validIntAge = hasAge && isValidAgeInteger(parsedAge);

  // Category vs Age mismatch detection (with exclamation error + 1-click switch helper)
  const isCategoryMismatch =
    validIntAge && !matchesSelectedCategory(parsedAge, form.selectedCategory);
  let ageError: string | null = null;
  if (hasAge || attempted) {
    if (!hasAge) {
      ageError = 'Please enter the attendee’s age.';
    } else if (!isValidAgeInteger(parsedAge)) {
      ageError = 'Please enter a valid whole-number age between 0 and 120.';
    } else if (isCategoryMismatch) {
      ageError = buildCategoryMismatchMessage(parsedAge, form.selectedCategory);
    }
  }

  // Guardian fields show ALWAYS for Child (5-11) & Under 5 (0-4), AND gracefully appear
  // on Adult (12+) forms whenever the entered age is 12–17!
  const needsGuardian =
    form.selectedCategory === 'child' ||
    form.selectedCategory === 'infant' ||
    (validIntAge && requiresGuardian(parsedAge));

  const nameError =
    attempted && form.fullName.trim().length < 2 ? 'Please enter full name.' : null;

  const phoneError = (() => {
    if (form.selectedCategory === 'adult') {
      if (attempted && form.phone.trim().length === 0) {
        return 'Phone number is required for adult passholders.';
      }
      if (form.phone.trim().length > 0 && !isValidPhone(form.phone)) {
        return 'Please enter a valid phone number (7–15 digits).';
      }
      return null;
    }
    if (form.phone.trim().length > 0 && !isValidPhone(form.phone)) {
      return 'Please enter a valid optional phone number (7–15 digits).';
    }
    return null;
  })();

  const emailError =
    form.email.trim().length > 0 && !isValidEmail(form.email)
      ? 'Please enter a valid email address.'
      : null;

  const guardianNameError =
    attempted && needsGuardian && form.guardian.name.trim().length < 2
      ? 'Guardian name is required before booking a pass for a minor.'
      : null;

  const guardianPhoneError =
    attempted && needsGuardian && !isValidPhone(form.guardian.phone)
      ? 'Valid guardian phone number is required before booking a pass for a minor.'
      : null;

  const daysError =
    attempted &&
    (form.passKind === 'day_pass' || form.passKind === 'free_infant') &&
    form.days.length === 0
      ? 'Please select at least one festival day.'
      : null;

  const handleCategorySwitch = (nextCat: AttendeeCategoryChoice): void => {
    setForm((prev) => changeAttendeeCategory(prev, nextCat, []));
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setAttempted(true);

    if (
      form.fullName.trim().length < 2 ||
      !validIntAge ||
      isCategoryMismatch ||
      Boolean(phoneError) ||
      Boolean(emailError) ||
      (form.selectedCategory === 'adult' && !isValidPhone(form.phone)) ||
      (needsGuardian &&
        (form.guardian.name.trim().length < 2 || !isValidPhone(form.guardian.phone))) ||
      ((form.passKind === 'day_pass' || form.passKind === 'free_infant') &&
        form.days.length === 0)
    ) {
      return;
    }

    onSave(form);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialAttendee ? 'Edit Attendee Pass' : 'Add Group Attendee'}
      subtitle="Select attendee category and complete pass & safeguard details"
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Step 1: Adult / Child / Under 5 selector + Age Rules right below */}
        <div className="space-y-2.5">
          <span className="block text-sm font-semibold text-[#FDF3E4]">
            Is this attendee an Adult, Child, or Under 5?
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(
              [
                { id: 'adult', title: 'Adult Pass', sub: 'Ages 12 & above · $15/day' },
                { id: 'child', title: 'Child Pass', sub: 'Ages 5 to 11 · $8/day or $30 All-Day' },
                { id: 'infant', title: 'Under 5 (Free)', sub: 'Ages 0 to 4 · Free Entry' },
              ] as const
            ).map((opt) => {
              const active = form.selectedCategory === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleCategorySwitch(opt.id)}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-[#C99B24] bg-[#C99B24]/20'
                      : 'border-white/20 bg-white/[0.04] hover:border-white/40'
                  }`}
                >
                  <span className="block text-sm font-bold text-white">{opt.title}</span>
                  <span className="block text-xs text-white/70 mt-0.5">{opt.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Age Rules Box displayed right below category selector */}
          <div className="rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-xs text-white/75 space-y-1">
            <p className="font-semibold text-[#D1AC3E]">Festival Age & Guardian Rules (as of 10 Dec 2026):</p>
            <p>
              • <strong>Under 5 (0–4):</strong> Free entry · Guardian details required. &nbsp;|&nbsp;{' '}
              <strong>Ages 5–11:</strong> Child Pass · Guardian details required. &nbsp;|&nbsp;{' '}
              <strong>Ages 12+:</strong> Adult Pass (ages 12–17 also require Guardian details).
            </p>
          </div>
        </div>

        {/* Attendee Details Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Attendee Full Name"
            required
            placeholder="Arjun Patel"
            value={form.fullName}
            onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            error={nameError}
          />

          <div>
            <TextField
              label="Age (on 10 Dec 2026)"
              inputMode="numeric"
              required
              placeholder={
                form.selectedCategory === 'adult'
                  ? 'e.g. 32 or 15'
                  : form.selectedCategory === 'child'
                    ? 'e.g. 9'
                    : 'e.g. 3'
              }
              value={form.ageInput}
              onChange={(e) => setForm((p) => ({ ...p, ageInput: e.target.value }))}
              error={ageError}
            />
            {isCategoryMismatch && validIntAge && (
              <button
                type="button"
                onClick={() => handleCategorySwitch(classifyAge(parsedAge))}
                className="mt-2 inline-flex items-center rounded-lg border border-[#C99B24] bg-[#C99B24]/20 px-3 py-1 text-xs font-semibold text-[#D1AC3E] hover:bg-[#C99B24]/30 cursor-pointer"
              >
                Switch attendee type to {formatCategoryLabel(classifyAge(parsedAge))}
              </button>
            )}
          </div>

          {form.selectedCategory !== 'infant' && (
            <TextField
              label="Phone Number"
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
              label="Email Address"
              type="email"
              optionalLabel="Optional"
              placeholder="guest@example.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              error={emailError}
            />
          )}
        </div>

        {/* Graceful Guardian Reveal for <18 (Child 5-11, Under 5, AND 12-17 on Adult Pass!) */}
        {needsGuardian && (
          <GuardianFields
            attendeeAgeLabel={
              form.selectedCategory === 'adult'
                ? `Age ${parsedAge} · Minor on Adult Pass`
                : form.selectedCategory === 'child'
                  ? 'Child Pass (5–11)'
                  : 'Under 5 Free Pass'
            }
            guardianName={form.guardian.name}
            guardianPhone={form.guardian.phone}
            onChange={(guardian) => setForm((p) => ({ ...p, guardian }))}
            bookerQuickFill={bookerQuickFill}
            nameError={guardianNameError}
            phoneError={guardianPhoneError}
          />
        )}

        {/* Pass Type & Days */}
        <PassDaySelector
          category={form.selectedCategory}
          passKind={form.passKind}
          selectedDays={form.days}
          onChangePassKind={(passKind) => setForm((p) => ({ ...p, passKind }))}
          onChangeDays={(days) => setForm((p) => ({ ...p, days }))}
          error={daysError}
        />

        {/* Extra Add-Ons */}
        <ExtrasSelector
          category={form.selectedCategory}
          passKind={form.passKind}
          selectedDays={form.days}
          extras={form.extras}
          onChangeExtras={(extras) => setForm((p) => ({ ...p, extras }))}
        />

        <div className="pt-3 border-t border-white/15 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {initialAttendee ? 'Save Attendee Changes' : 'Add Attendee to Group'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
