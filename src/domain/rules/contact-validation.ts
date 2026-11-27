const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_CHARS = /^[+\d\s().-]+$/;

export function isValidEmail(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Canonical phone key for uniqueness checks.
 * Normalizes formatting and strips a leading US/Canada country code '1' on 11-digit numbers
 * so "+1 469-555-0192" and "469-555-0192" resolve to the same individual.
 */
export function normalizePhoneKey(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isValidPhone(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!PHONE_ALLOWED_CHARS.test(trimmed)) return false;
  const digits = normalizePhoneDigits(trimmed);
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Computes a unique passholder identity key:
 * - Adults & 12–17 minors (`category === 'adult'`): keyed by normalized attendee phone number.
 * - Children (5–11) & Under 5 (0–4): keyed by normalized guardian phone + normalized child full name,
 *   allowing one guardian to book passes for multiple distinct children while blocking duplicate passes
 *   for the same child.
 */
export function computeAttendeeIdentityKey(input: {
  category: 'adult' | 'child' | 'infant';
  fullName: string;
  phone?: string | null;
  guardianPhone?: string | null;
}): string | null {
  if (input.category === 'adult') {
    if (!input.phone || !isValidPhone(input.phone)) return null;
    return `adult_phone:${normalizePhoneKey(input.phone)}`;
  }

  const normName = normalizePersonName(input.fullName);
  if (normName.length < 2 || !input.guardianPhone || !isValidPhone(input.guardianPhone)) {
    return null;
  }
  return `minor_guardian_name:${normalizePhoneKey(input.guardianPhone)}::${normName}`;
}

export interface PromoParticipant {
  readonly key: string;
  readonly label: string;
}

/**
 * Extracts all canonical participant keys (booker + every attendee) for enforcing
 * the "maximum 1 coupon per booker and per attendee across all bookings" anti-abuse rule.
 *
 * Because bookers and adult/12+ attendees share the `person_phone:` / `person_email:` key space,
 * an attendee from Booking #1 who returns as the Lead Booker of Booking #2 (or vice versa) is
 * matched immediately.
 */
export function collectPromoParticipants(input: {
  booker: {
    fullName: string;
    email: string;
    phone: string;
  };
  attendees: ReadonlyArray<{
    category: 'adult' | 'child' | 'infant';
    fullName: string;
    email?: string | null;
    phone?: string | null;
    guardianPhone?: string | null;
  }>;
}): PromoParticipant[] {
  const byKey = new Map<string, string>();
  const add = (key: string | null, label: string): void => {
    if (!key || byKey.has(key)) return;
    byKey.set(key, label);
  };

  const bookerLabel = input.booker.fullName.trim() || 'Lead booker';
  if (isValidPhone(input.booker.phone)) {
    add(`person_phone:${normalizePhoneKey(input.booker.phone)}`, bookerLabel);
  }
  if (isValidEmail(input.booker.email)) {
    add(`person_email:${normalizeEmail(input.booker.email)}`, bookerLabel);
  }

  for (const att of input.attendees) {
    const attLabel = att.fullName.trim() || 'Attendee';
    if (att.category === 'adult') {
      if (att.phone && isValidPhone(att.phone)) {
        add(`person_phone:${normalizePhoneKey(att.phone)}`, attLabel);
      }
      if (att.email && isValidEmail(att.email)) {
        add(`person_email:${normalizeEmail(att.email)}`, attLabel);
      }
    } else {
      const minorKey = computeAttendeeIdentityKey({
        category: att.category,
        fullName: att.fullName,
        phone: att.phone,
        guardianPhone: att.guardianPhone,
      });
      add(minorKey, attLabel);
      if (att.phone && isValidPhone(att.phone)) {
        add(`person_phone:${normalizePhoneKey(att.phone)}`, attLabel);
      }
    }
  }

  return [...byKey.entries()].map(([key, label]) => ({ key, label }));
}
