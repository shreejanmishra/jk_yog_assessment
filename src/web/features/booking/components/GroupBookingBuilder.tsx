import React, { useMemo, useState } from 'react';
import { Edit2, Plus, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';
import {
  FESTIVAL_DAYS,
  formatCategoryLabel,
  isLegalAdultBooker,
  isValidAgeInteger,
  isValidEmail,
  isValidPhone,
  requiresGuardian,
} from '@domain/index';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { FieldError, TextField } from '../../../ui/TextField';
import { useBookingStore } from '../store/booking-store';
import { parseIntegerAge, type AttendeeDraft } from '../store/transitions';
import { AddAttendeeModal } from './AddAttendeeModal';
import { ExtrasSelector } from './ExtrasSelector';
import { PassDaySelector } from './PassDaySelector';

export function GroupBookingBuilder(): React.ReactElement {
  const {
    draft,
    patchBooker,
    addAttendee,
    updateAttendee,
    removeAttendee,
    applyFamilyPassForDay,
    clearFamilyPass,
    openCheckoutModal,
  } = useBookingStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState<AttendeeDraft | null>(null);
  const [attempted, setAttempted] = useState(false);

  const bookerAge = parseIntegerAge(draft.booker.ageInput);
  const hasBookerAge = draft.booker.ageInput.trim().length > 0;

  let bookerAgeError: string | null = null;
  if (hasBookerAge || attempted) {
    if (!hasBookerAge) {
      bookerAgeError = 'Please enter the booker’s age.';
    } else if (!isValidAgeInteger(bookerAge)) {
      bookerAgeError = 'Please enter a whole-number age between 0 and 120.';
    } else if (!isLegalAdultBooker(bookerAge)) {
      bookerAgeError = `Booker is less than 18 (entered ${bookerAge}). Primary booker must be 18 or older.`;
    }
  }

  const isBookerUnder18 = hasBookerAge && isValidAgeInteger(bookerAge) && bookerAge < 18;
  const selfAttendee = draft.attendees.find((a) => a.isBooker) ?? null;
  const extraAttendees = draft.attendees.filter((a) => !a.isBooker);

  // Detect if group has 2 adults + 1-2 children sharing a single day (eligible to save with $40 Family Pass!)
  const familySuggestion = useMemo(() => {
    if (draft.familyGroups.length > 0) return null;
    for (const day of FESTIVAL_DAYS) {
      const adultsOnDay = draft.attendees.filter(
        (a) =>
          a.selectedCategory === 'adult' &&
          a.passKind === 'day_pass' &&
          a.days.length === 1 &&
          a.days[0] === day.date,
      );
      const childrenOnDay = draft.attendees.filter(
        (a) =>
          a.selectedCategory === 'child' &&
          a.passKind === 'day_pass' &&
          a.days.length === 1 &&
          a.days[0] === day.date,
      );
      if (adultsOnDay.length === 2 && childrenOnDay.length === 2) {
        const chosen = [...adultsOnDay.slice(0, 2), ...childrenOnDay.slice(0, 2)];
        return {
          date: day.date,
          shortLabel: day.shortLabel,
          memberIds: chosen.map((m) => m.clientId),
          savingsDollars: 6, // 2*$15 + 2*$8 = $46 vs $40 Family Pass
        };
      }
    }
    return null;
  }, [draft.attendees, draft.familyGroups.length]);

  const handleConfirmGroup = (e: React.FormEvent): void => {
    e.preventDefault();
    setAttempted(true);

    if (
      draft.booker.fullName.trim().length < 2 ||
      !isValidPhone(draft.booker.phone) ||
      !isValidEmail(draft.booker.email) ||
      !isLegalAdultBooker(bookerAge) ||
      draft.attendees.length === 0
    ) {
      return;
    }

    if (
      selfAttendee &&
      selfAttendee.passKind === 'day_pass' &&
      selfAttendee.days.length === 0
    ) {
      return;
    }

    openCheckoutModal();
  };

  return (
    <form onSubmit={handleConfirmGroup} noValidate className="space-y-6">
      {/* 1. Primary Booker Card */}
      <Card className="p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#FDF3E4]">
              Primary Booker Details
            </h2>
            <p className="text-sm text-white/70">
              Person paying for the group (must be 18+). Confirmation & passes will be emailed here.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.05] px-3.5 py-2 text-xs sm:text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={draft.booker.isAttending}
              onChange={(e) => patchBooker({ isAttending: e.target.checked })}
              className="h-4 w-4 accent-[#C99B24]"
            />
            <span>I am also attending</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Full Name"
            required
            placeholder="Ramesh Sharma"
            value={draft.booker.fullName}
            onChange={(e) => patchBooker({ fullName: e.target.value })}
            error={
              attempted && draft.booker.fullName.trim().length < 2
                ? 'Please enter the booker’s full name.'
                : null
            }
          />
          <TextField
            label="Phone Number"
            type="tel"
            required
            placeholder="+1 469-555-0192"
            value={draft.booker.phone}
            onChange={(e) => patchBooker({ phone: e.target.value })}
            error={
              attempted && !isValidPhone(draft.booker.phone)
                ? 'Please enter a valid phone number.'
                : null
            }
          />
          <TextField
            label="Email Address"
            type="email"
            required
            placeholder="ramesh@example.com"
            value={draft.booker.email}
            onChange={(e) => patchBooker({ email: e.target.value })}
            error={
              attempted && !isValidEmail(draft.booker.email)
                ? 'Please enter a valid email address.'
                : null
            }
          />
          <TextField
            label="Booker Age (on 10 Dec 2026)"
            inputMode="numeric"
            required
            placeholder="e.g. 34"
            value={draft.booker.ageInput}
            onChange={(e) => patchBooker({ ageInput: e.target.value })}
            error={bookerAgeError}
          />
        </div>

        {selfAttendee && (
          <div className="pt-4 border-t border-white/15 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#D1AC3E]">
                Primary Booker’s Festival Pass & Add-Ons
              </span>
              <Badge variant="gold">Attendee #1 (Adult 18+)</Badge>
            </div>
            <PassDaySelector
              category="adult"
              passKind={selfAttendee.passKind}
              selectedDays={selfAttendee.days}
              onChangePassKind={(passKind) =>
                updateAttendee(selfAttendee.clientId, (prev) => ({ ...prev, passKind }))
              }
              onChangeDays={(days) =>
                updateAttendee(selfAttendee.clientId, (prev) => ({ ...prev, days }))
              }
              error={
                attempted &&
                selfAttendee.passKind === 'day_pass' &&
                selfAttendee.days.length === 0
                  ? 'Select at least one festival day.'
                  : null
              }
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
          </div>
        )}
      </Card>

      {/* Family Pass $40 Smart Suggestion / Active Banner */}
      {familySuggestion && (
        <div className="rounded-2xl border border-[#C99B24] bg-[#C99B24]/15 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Sparkles className="h-5 w-5 text-[#D1AC3E] shrink-0" />
            <span>
              <strong>Save ${familySuggestion.savingsDollars}.00:</strong> Bundle 2 Adults + 2
              Children on <strong>{familySuggestion.shortLabel}</strong> into a{' '}
              <strong>$40 Family Pass</strong>!
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              applyFamilyPassForDay(familySuggestion.date, familySuggestion.memberIds)
            }
          >
            Apply $40 Family Pass
          </Button>
        </div>
      )}

      {draft.familyGroups.length > 0 && (
        <div className="rounded-2xl border border-[#28A736]/60 bg-[#28A736]/15 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-[#4CC75A] font-medium">
            ✓ Family Pass ($40 flat) applied for {draft.familyGroups[0]?.days.join(', ')}.
          </span>
          <Button variant="secondary" size="sm" onClick={clearFamilyPass}>
            Switch Back to Separate Passes
          </Button>
        </div>
      )}

      {/* 2. Group Attendees Section + Left "+" Icon & Greyed Dashed "Add attendee" Row */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-[#FDF3E4] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#D1AC3E]" />
            <span>Group Attendees ({draft.attendees.length})</span>
          </h3>
          <span className="text-xs text-white/60">Max 20 attendees per booking</span>
        </div>

        {extraAttendees.map((att, idx) => {
          const ageNum = parseIntegerAge(att.ageInput);
          const minor = isValidAgeInteger(ageNum) && requiresGuardian(ageNum);
          return (
            <Card key={att.clientId} className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-bold text-[#FDF3E4]">
                    {att.fullName || `Attendee ${idx + 2}`}
                  </span>
                  <Badge variant={att.selectedCategory === 'infant' ? 'free' : 'gold'}>
                    {formatCategoryLabel(att.selectedCategory)} · Age {att.ageInput}
                  </Badge>
                </div>

                <p className="text-xs sm:text-sm text-white/80">
                  <strong>Pass:</strong>{' '}
                  {att.passKind === 'all_day'
                    ? 'All-Day Pass (All 5 Days)'
                    : att.passKind === 'family_pass'
                      ? `Family Pass (${att.days.join(', ')})`
                      : att.passKind === 'free_infant'
                        ? `Free Entry (${att.days.join(', ')})`
                        : `Day Pass (${att.days.join(', ')})`}
                </p>

                {(att.extras.dinnerDates.length > 0 ||
                  att.extras.workshopDates.length > 0 ||
                  att.extras.dandiyaPairs > 0) && (
                  <p className="text-xs text-white/70">
                    <strong>Extras:</strong>{' '}
                    {[
                      att.extras.dinnerDates.length > 0
                        ? `Dinner × ${att.extras.dinnerDates.length}`
                        : null,
                      att.extras.workshopDates.length > 0
                        ? `Garba Workshop (${att.extras.workshopDates.join(', ')})`
                        : null,
                      att.extras.dandiyaPairs > 0
                        ? `Dandiya × ${att.extras.dandiyaPairs} pair(s)`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}

                {minor && att.guardian.name && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-[#D1AC3E]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>
                      Guardian: {att.guardian.name} ({att.guardian.phone})
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingAttendee(att);
                    setModalOpen(true);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Remove ${att.fullName}`}
                  onClick={() => removeAttendee(att.clientId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}

        {/* Required UX: Plus icon on the left + greyed out outline box beside it saying "Add attendee" */}
        {draft.attendees.length < 20 && (
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditingAttendee(null);
                setModalOpen(true);
              }}
              aria-label="Add attendee"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#C99B24] bg-[#C99B24]/15 text-[#D1AC3E] hover:bg-[#C99B24] hover:text-[#2C2C2C] transition-colors cursor-pointer"
            >
              <Plus className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingAttendee(null);
                setModalOpen(true);
              }}
              className="flex-1 min-h-12 rounded-xl border-2 border-dashed border-white/25 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-white/55 hover:border-[#BC9226] hover:text-white/85 hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              Add attendee
            </button>
          </div>
        )}

        {attempted && draft.attendees.length === 0 && (
          <FieldError message="Add at least one attendee (or enable 'I am also attending' above) to book." />
        )}
      </div>

      {/* Confirm Footer */}
      <Card className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs sm:text-sm text-white/75">
          <strong>{draft.attendees.length}</strong> attendee pass
          {draft.attendees.length === 1 ? '' : 'es'} ready · Server calculates exact group total &
          promos next.
        </div>
        <Button type="submit" variant="primary" size="lg" disabled={isBookerUnder18}>
          Confirm Group & Review Passes
        </Button>
      </Card>

      <AddAttendeeModal
        open={modalOpen}
        initialAttendee={editingAttendee}
        bookerQuickFill={
          isLegalAdultBooker(bookerAge)
            ? { name: draft.booker.fullName, phone: draft.booker.phone }
            : null
        }
        onClose={() => {
          setModalOpen(false);
          setEditingAttendee(null);
        }}
        onSave={(saved) => {
          if (editingAttendee) {
            updateAttendee(saved.clientId, () => saved);
          } else {
            addAttendee(saved);
          }
        }}
      />
    </form>
  );
}
