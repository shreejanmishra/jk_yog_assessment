import React, { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import {
  buildCatalogMap,
  calculateBookingQuote,
  computeAttendeeIdentityKey,
  DEFAULT_CATALOG,
  DEFAULT_PROMOS,
  FESTIVAL_DAYS,
  formatCategoryLabel,
  isLegalAdultBooker,
  isValidAgeInteger,
  isValidEmail,
  isValidPhone,
  requiresGuardian,
  validateBookingRules,
  type RuleViolation,
} from '@domain/index';
import { useCatalogStore } from '../../../stores/catalog-store';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { FormSection } from '../../../ui/FormSection';
import { FieldError, TextField } from '../../../ui/TextField';
import { useBookingStore } from '../store/booking-store';
import {
  draftToBookingIntent,
  parseIntegerAge,
  type AttendeeDraft,
} from '../store/transitions';
import { AddAttendeeModal } from './AddAttendeeModal';
import { ExtrasSelector } from './ExtrasSelector';
import { PassDaySelector } from './PassDaySelector';

function describePassSelection(att: AttendeeDraft): string {
  if (att.passKind === 'all_day') return 'All-day pass (all 5 evenings)';
  if (att.passKind === 'family_pass') return `Family pass (${att.days.join(', ')})`;
  if (att.passKind === 'free_infant') return `Free entry (${att.days.join(', ')})`;
  return `Day pass (${att.days.join(', ')})`;
}

function describeAddOns(att: AttendeeDraft): string | null {
  const parts = [
    att.extras.dinnerDates.length > 0 ? `Dinner × ${att.extras.dinnerDates.length}` : null,
    att.extras.workshopDates.length > 0
      ? `Garba workshop (${att.extras.workshopDates.join(', ')})`
      : null,
    att.extras.dandiyaPairs > 0 ? `Dandiya × ${att.extras.dandiyaPairs}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function GroupBookingBuilder(): React.ReactElement {
  const catalog = useCatalogStore((s) => s.catalog);
  const {
    draft,
    quoteState,
    patchBooker,
    addAttendee,
    updateAttendee,
    removeAttendee,
    applyFamilyPassForDay,
    clearFamilyPass,
    openCheckoutModal,
  } = useBookingStore();

  const formRef = useRef<HTMLFormElement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAttendee, setEditingAttendee] = useState<AttendeeDraft | null>(null);
  const [editingHasViolations, setEditingHasViolations] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const bookerAge = parseIntegerAge(draft.booker.ageInput);
  const hasBookerAge = draft.booker.ageInput.trim().length > 0;

  let bookerAgeError: string | null = null;
  if (hasBookerAge || attempted) {
    if (!hasBookerAge) {
      bookerAgeError = 'Please enter the lead booker’s age.';
    } else if (!isValidAgeInteger(bookerAge)) {
      bookerAgeError = 'Please enter a whole-number age between 0 and 120.';
    } else if (!isLegalAdultBooker(bookerAge)) {
      bookerAgeError = `Booker is less than 18 (entered ${bookerAge}). Lead booker must be 18 or older.`;
    }
  }

  const isBookerUnder18 = hasBookerAge && isValidAgeInteger(bookerAge) && bookerAge < 18;
  const selfAttendee = draft.attendees.find((a) => a.isBooker) ?? null;
  const extraAttendees = draft.attendees.filter((a) => !a.isBooker);

  const bookerDuplicatePhoneMatch = useMemo(() => {
    if (!draft.booker.isAttending) return null;
    const bookerKey = computeAttendeeIdentityKey({
      category: 'adult',
      fullName: draft.booker.fullName,
      phone: draft.booker.phone,
    });
    if (!bookerKey) return null;
    return (
      extraAttendees.find(
        (att) =>
          computeAttendeeIdentityKey({
            category: att.selectedCategory,
            fullName: att.fullName,
            phone: att.phone,
            guardianPhone: att.guardian.phone,
          }) === bookerKey,
      ) ?? null
    );
  }, [draft.booker.isAttending, draft.booker.fullName, draft.booker.phone, extraAttendees]);

  const bookerPhoneError = bookerDuplicatePhoneMatch
    ? `This phone number is already assigned to ${bookerDuplicatePhoneMatch.fullName.trim() || 'another attendee'} in this booking.`
    : attempted && !isValidPhone(draft.booker.phone)
      ? 'Please enter a valid phone number.'
      : null;

  // Evaluate the full shared domain rule + stock pipeline synchronously so every attendee card
  // immediately displays any rule violation right where it occurs.
  const { violationsByClientId, bookingLevelViolations, totalViolationCount } = useMemo(() => {
    const liveProducts = DEFAULT_CATALOG.map((base) => {
      const live = catalog?.products.find((p) => p.code === base.code);
      return live ? { ...base, remainingStock: live.availability.remaining } : base;
    });
    const todayIsoDate = catalog?.event.todayIsoDate ?? '2026-11-26';
    const intent = draftToBookingIntent(draft);
    const catalogMap = buildCatalogMap(liveProducts);

    const domainViolations = validateBookingRules({
      intent,
      catalogMap,
      todayIsoDate,
    });

    // Also capture stock violations (e.g. 3 workshop seats requested when 2 remain) once structural rules pass
    let stockOrServerViolations: readonly { path: string; code: string; message: string }[] = [];
    if (domainViolations.length === 0) {
      const quoteCheck = calculateBookingQuote({
        intent,
        products: liveProducts,
        promos: DEFAULT_PROMOS,
        nowIso: new Date().toISOString(),
        todayIsoDate,
        strictPromo: false,
      });
      if (!quoteCheck.ok) {
        stockOrServerViolations = quoteCheck.violations;
      }
    } else if (quoteState.status === 'invalid') {
      stockOrServerViolations = quoteState.issues.filter((iss) => iss.path.startsWith('stock.'));
    }

    const byClient = new Map<string, RuleViolation[]>();
    const general: Array<{ path: string; code: string; message: string }> = [];

    for (const v of domainViolations) {
      const match = /^attendees\[(\d+)\]/.exec(v.path);
      if (match) {
        const idx = Number(match[1]);
        const target = draft.attendees[idx];
        if (target) {
          const list = byClient.get(target.clientId) ?? [];
          if (!list.some((existing) => existing.message === v.message)) {
            list.push(v);
          }
          byClient.set(target.clientId, list);
          continue;
        }
      }
      if (!v.path.startsWith('booker.')) {
        general.push(v);
      }
    }

    for (const sv of stockOrServerViolations) {
      if (!general.some((g) => g.message === sv.message)) {
        general.push(sv);
      }
    }

    return {
      violationsByClientId: byClient,
      bookingLevelViolations: general,
      totalViolationCount: domainViolations.length + stockOrServerViolations.length,
    };
  }, [catalog, draft, quoteState]);

  const familySuggestion = useMemo(() => {
    if (draft.familyGroups.length > 0) return null;
    const familyProd = catalog?.products.find((p) => p.code === 'FAMILY_PASS');
    if (catalog && (familyProd?.availability.remaining ?? 0) <= 0) return null;
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
              savingsDollars: 6,
            };
          }
        }
        return null;
      }, [catalog, draft.attendees, draft.familyGroups.length]);

  const scrollToFirstProblem = (): void => {
    const root = formRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-has-violation="true"]',
    );
    if (!target) return;

    const focusEl = target.matches('input, button, select, textarea')
      ? target
      : target.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)');
    focusEl?.focus({ preventScroll: true });

    const anchor = target.matches('input, select, textarea')
      ? (target.closest('div') ?? target)
      : target;
    window.requestAnimationFrame(() => {
      const rect = anchor.getBoundingClientRect();
      const targetTop = Math.max(0, window.scrollY + rect.top - 120);
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  };

  const handleConfirmGroup = (e: React.FormEvent): void => {
    e.preventDefault();
    flushSync(() => {
      setAttempted(true);
    });

    if (
      draft.booker.fullName.trim().length < 2 ||
      !isValidPhone(draft.booker.phone) ||
      Boolean(bookerDuplicatePhoneMatch) ||
      !isValidEmail(draft.booker.email) ||
      !isLegalAdultBooker(bookerAge) ||
      draft.attendees.length === 0 ||
      totalViolationCount > 0
    ) {
      scrollToFirstProblem();
      return;
    }

    openCheckoutModal();
  };

  const selfViolations = selfAttendee
    ? (violationsByClientId.get(selfAttendee.clientId) ?? [])
    : [];
  const showSelfCardViolations =
    attempted ||
    Boolean(bookerDuplicatePhoneMatch) ||
    isBookerUnder18 ||
    (selfAttendee !== null &&
      selfAttendee.passKind === 'day_pass' &&
      selfAttendee.days.length === 0);

  return (
    <>
      <form ref={formRef} onSubmit={handleConfirmGroup} noValidate className="space-y-10">
        <FormSection
          step="1"
          title="Lead booker"
          description="The adult paying for the group (18 or over). Confirmation and passes are emailed here."
          action={
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-white/85">
              <input
                type="checkbox"
                checked={draft.booker.isAttending}
                onChange={(e) => patchBooker({ isAttending: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              <span>I am also attending</span>
            </label>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
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
              label="Phone number"
              type="tel"
              required
              placeholder="+1 469-555-0192"
              value={draft.booker.phone}
              onChange={(e) => patchBooker({ phone: e.target.value })}
              error={bookerPhoneError}
            />
            <TextField
              label="Email address"
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
              label="Age (on 10 December 2026)"
              inputMode="numeric"
              required
              placeholder="34"
              value={draft.booker.ageInput}
              onChange={(e) => patchBooker({ ageInput: e.target.value })}
              error={bookerAgeError}
            />
          </div>

          {selfAttendee && (
            <div className="mt-8 space-y-6 border-t border-white/10 pt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-serif text-lg text-cream">Lead booker’s pass and add-ons</h3>
                <Badge variant="neutral">Attendee 1</Badge>
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
                    ? 'Select at least one evening.'
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
        </FormSection>

        {familySuggestion && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-gold/60 px-5 py-4">
            <p className="text-sm text-white/85">
              <span className="font-semibold text-cream">
                Save ${familySuggestion.savingsDollars}.00 on {familySuggestion.shortLabel}:
              </span>{' '}
              combine 2 adults and 2 children into a single $40.00 Family Pass.
            </p>
            <Button
              size="sm"
              onClick={() =>
                applyFamilyPassForDay(familySuggestion.date, familySuggestion.memberIds)
              }
            >
              Apply $40.00 Family Pass
            </Button>
          </div>
        )}

        {draft.familyGroups.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-success/50 px-5 py-4 text-sm">
            <span className="text-success-on-dark">
              Family Pass ($40.00) applied for {draft.familyGroups[0]?.days.join(', ')}.
            </span>
            <Button variant="secondary" size="sm" onClick={clearFamilyPass}>
              Use individual passes
            </Button>
          </div>
        )}

        <FormSection
          step="2"
          title={`Attendees (${draft.attendees.length})`}
          description="Add adults, children (5–11) or under-5s. Up to 20 people per booking."
        >
          <div className="space-y-3">
            {selfAttendee && (
              <div
                data-has-violation={
                  showSelfCardViolations && selfViolations.length > 0 ? 'true' : undefined
                }
                className={`rounded-card border px-5 py-4 ${
                  showSelfCardViolations && selfViolations.length > 0
                    ? 'border-error bg-error/[0.06]'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-serif text-lg text-cream">
                        {selfAttendee.fullName.trim() || 'Lead booker'}
                      </span>
                      <Badge variant="neutral">
                        Attendee 1 · Lead booker
                        {selfAttendee.ageInput.trim() ? ` · Age ${selfAttendee.ageInput.trim()}` : ''}
                      </Badge>
                      {showSelfCardViolations && selfViolations.length > 0 && (
                        <Badge variant="sold-out">Rule violation</Badge>
                      )}
                    </div>
                    <p className="text-sm text-white/75">{describePassSelection(selfAttendee)}</p>
                    {describeAddOns(selfAttendee) && (
                      <p className="text-xs text-white/55">Add-ons: {describeAddOns(selfAttendee)}</p>
                    )}
                  </div>
                  <span className="text-xs text-white/45">Configured in Step 1</span>
                </div>

                {showSelfCardViolations && selfViolations.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-error/30 pt-2.5">
                    {selfViolations.map((v, i) => (
                      <FieldError key={`${v.code}-${i}`} message={v.message} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {extraAttendees.map((att, idx) => {
              const ageNum = parseIntegerAge(att.ageInput);
              const minor = isValidAgeInteger(ageNum) && requiresGuardian(ageNum);
              const attendeeNumber = (selfAttendee ? 2 : 1) + idx;
              const addOnsLabel = describeAddOns(att);
              const cardViolations = violationsByClientId.get(att.clientId) ?? [];
              const hasViolation = cardViolations.length > 0;

              return (
                <div
                  key={att.clientId}
                  data-has-violation={hasViolation ? 'true' : undefined}
                  className={`reveal rounded-card border px-5 py-4 transition-colors ${
                    hasViolation
                      ? 'border-error bg-error/[0.06]'
                      : 'border-gold/40 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-serif text-lg text-cream">
                          {att.fullName || `Attendee ${attendeeNumber}`}
                        </span>
                        <Badge variant={att.selectedCategory === 'infant' ? 'free' : 'gold'}>
                          Attendee {attendeeNumber} · {formatCategoryLabel(att.selectedCategory)}
                          {att.ageInput.trim() ? ` · Age ${att.ageInput.trim()}` : ''}
                        </Badge>
                        {hasViolation && (
                          <Badge variant="sold-out">
                            {cardViolations.length === 1
                              ? '1 rule violation'
                              : `${cardViolations.length} rule violations`}
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-white/75">{describePassSelection(att)}</p>

                      {addOnsLabel && <p className="text-xs text-white/55">Add-ons: {addOnsLabel}</p>}

                      {minor && att.guardian.name && (
                        <p className="text-xs text-bright-gold">
                          Guardian: {att.guardian.name} ({att.guardian.phone})
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={hasViolation ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          setEditingAttendee(att);
                          setEditingHasViolations(hasViolation);
                          setModalOpen(true);
                        }}
                      >
                        {hasViolation ? 'Fix details' : 'Edit'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        aria-label={`Remove ${att.fullName}`}
                        onClick={() => removeAttendee(att.clientId)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {hasViolation && (
                    <div className="mt-3 space-y-1 border-t border-error/30 pt-2.5">
                      {cardViolations.map((v, vIdx) => (
                        <FieldError key={`${v.code}-${vIdx}`} message={v.message} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Required UX: Plus icon on the left + greyed out outline box beside it saying "Add attendee" */}
            {draft.attendees.length < 20 && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAttendee(null);
                    setEditingHasViolations(false);
                    setModalOpen(true);
                  }}
                  aria-label="Add attendee"
                  className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-control border border-gold text-bright-gold transition-colors hover:bg-primary hover:text-primary-dark"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingAttendee(null);
                    setEditingHasViolations(false);
                    setModalOpen(true);
                  }}
                  className="min-h-12 flex-1 cursor-pointer rounded-control border border-dashed border-white/25 px-4 py-3 text-left text-sm text-white/50 transition-colors hover:border-gold hover:text-white/85"
                >
                  Add attendee
                </button>
              </div>
            )}

            {attempted && draft.attendees.length === 0 && (
              <FieldError message="Add at least one attendee (or tick ‘I am also attending’ above) before continuing." />
            )}
          </div>
        </FormSection>

        {bookingLevelViolations.length > 0 && (
          <div
            data-has-violation="true"
            className="space-y-1 rounded-card border border-error/70 bg-error/[0.06] px-5 py-4"
          >
            {bookingLevelViolations.map((v, idx) => (
              <FieldError key={`${v.code}-${idx}`} message={v.message} />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="tabular text-sm text-white/65">
            {draft.attendees.length} {draft.attendees.length === 1 ? 'pass' : 'passes'} in this
            booking
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={bookingLevelViolations.some(
              (v) => v.code === 'PRODUCT_SOLD_OUT' || v.code === 'INSUFFICIENT_STOCK',
            )}
          >
            Confirm and review passes
          </Button>
        </div>
      </form>

      <AddAttendeeModal
        open={modalOpen}
        initialAttendee={editingAttendee}
        initialShowErrors={editingHasViolations}
        existingAttendees={draft.attendees}
        bookerQuickFill={
          isLegalAdultBooker(bookerAge)
            ? { name: draft.booker.fullName, phone: draft.booker.phone }
            : null
        }
        onClose={() => {
          setModalOpen(false);
          setEditingAttendee(null);
          setEditingHasViolations(false);
        }}
        onSave={(saved) => {
          if (editingAttendee) {
            updateAttendee(saved.clientId, () => saved);
          } else {
            addAttendee(saved);
          }
        }}
      />
    </>
  );
}
