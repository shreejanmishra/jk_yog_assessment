import { isValidAgeInteger, requiresGuardian } from '../age';
import type { BookingIntent } from '../booking-types';
import type { RuleViolation } from '../errors';
import { isValidPhone } from './contact-validation';

/**
 * Enforces mandatory Guardian Name & Guardian Phone Number for EVERY attendee under 18:
 * - Under 5 (ages 0–4)
 * - Child (ages 5–11)
 * - Minor teens on Adult passes (ages 12–17)
 */
export function checkGuardianRules(intent: BookingIntent): RuleViolation[] {
  const violations: RuleViolation[] = [];

  intent.attendees.forEach((attendee, index) => {
    if (!isValidAgeInteger(attendee.age) || !requiresGuardian(attendee.age)) {
      return;
    }

    const basePath = `attendees[${index}].guardian`;
    const guardianName = attendee.guardian?.name?.trim() ?? '';
    const guardianPhone = attendee.guardian?.phone?.trim() ?? '';

    if (guardianName.length < 2) {
      violations.push({
        code: 'GUARDIAN_NAME_REQUIRED',
        path: `${basePath}.name`,
        message: `Guardian name is required because ${attendee.fullName.trim() || 'this attendee'} is under 18 (age ${attendee.age}).`,
      });
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
    }
  });

  return violations;
}
