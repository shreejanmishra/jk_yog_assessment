import { isValidAgeInteger, requiresGuardian } from '../age';
import type { BookingIntent } from '../booking-types';
import type { RuleViolation } from '../errors';
import {
  isValidPhone,
  normalizePersonName,
  normalizePhoneKey,
} from './contact-validation';

/**
 * Enforces mandatory Guardian Name & Guardian Phone Number for EVERY attendee under 18:
 * - Under 5 (ages 0–4)
 * - Child (ages 5–11)
 * - Minor teens on Adult passes (ages 12–17)
 *
 * Also ensures a minor's guardian name and phone never match the minor's own name/phone
 * (or another minor attendee in the same booking).
 */
export function checkGuardianRules(intent: BookingIntent): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const minorAttendees = intent.attendees.filter(
    (a) => isValidAgeInteger(a.age) && requiresGuardian(a.age),
  );

  intent.attendees.forEach((attendee, index) => {
    if (!isValidAgeInteger(attendee.age) || !requiresGuardian(attendee.age)) {
      return;
    }

    const basePath = `attendees[${index}].guardian`;
    const guardianName = attendee.guardian?.name?.trim() ?? '';
    const guardianPhone = attendee.guardian?.phone?.trim() ?? '';
    const attendeeNormName = normalizePersonName(attendee.fullName);
    const guardianNormName = normalizePersonName(guardianName);

    if (guardianName.length < 2) {
      violations.push({
        code: 'GUARDIAN_NAME_REQUIRED',
        path: `${basePath}.name`,
        message: `Guardian name is required because ${attendee.fullName.trim() || 'this attendee'} is under 18 (age ${attendee.age}).`,
      });
    } else if (attendeeNormName.length >= 2 && guardianNormName === attendeeNormName) {
      violations.push({
        code: 'GUARDIAN_SELF_MATCH',
        path: `${basePath}.name`,
        message: 'Guardian full name cannot be the same as the minor’s own name.',
      });
    } else {
      const otherMinorByName = minorAttendees.find(
        (m) => m.clientId !== attendee.clientId && normalizePersonName(m.fullName) === guardianNormName,
      );
      if (otherMinorByName) {
        violations.push({
          code: 'GUARDIAN_SELF_MATCH',
          path: `${basePath}.name`,
          message: `Guardian must be an adult aged 18 or over, not a minor in this booking (${otherMinorByName.fullName.trim()}).`,
        });
      }
    }

    if (guardianPhone.length === 0) {
      violations.push({
        code: 'GUARDIAN_PHONE_REQUIRED',
        path: `${basePath}.phone`,
        message: `Guardian phone number is required because ${attendee.fullName.trim() || 'this attendee'} is under 18 (age ${attendee.age}).`,
      });
    } else if (!isValidPhone(guardianPhone)) {
      violations.push({
        code: 'GUARDIAN_PHONE_INVALID',
        path: `${basePath}.phone`,
        message: 'Please enter a valid guardian phone number (7–15 digits).',
      });
    } else {
      const guardianPhoneKey = normalizePhoneKey(guardianPhone);
      if (
        attendee.phone &&
        isValidPhone(attendee.phone) &&
        normalizePhoneKey(attendee.phone) === guardianPhoneKey
      ) {
        violations.push({
          code: 'GUARDIAN_SELF_MATCH',
          path: `${basePath}.phone`,
          message: 'Guardian phone number cannot be the same as the minor’s own phone number.',
        });
      } else {
        const otherMinorByPhone = minorAttendees.find(
          (m) =>
            m.clientId !== attendee.clientId &&
            m.phone &&
            isValidPhone(m.phone) &&
            normalizePhoneKey(m.phone) === guardianPhoneKey,
        );
        if (otherMinorByPhone) {
          violations.push({
            code: 'GUARDIAN_SELF_MATCH',
            path: `${basePath}.phone`,
            message: `Guardian phone number belongs to a minor in this booking (${otherMinorByPhone.fullName.trim()}). Enter an adult guardian’s phone number.`,
          });
        }
      }
    }
  });

  return violations;
}
