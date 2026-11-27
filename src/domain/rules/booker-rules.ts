import { isLegalAdultBooker, isValidAgeInteger, LEGAL_ADULT_MIN_AGE } from '../age';
import type { BookingIntent } from '../booking-types';
import type { RuleViolation } from '../errors';
import { isValidEmail, isValidPhone } from './contact-validation';

export function checkBookerRules(intent: BookingIntent): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { booker } = intent;

  if (booker.fullName.trim().length < 2) {
    violations.push({
      code: 'BOOKER_NAME_REQUIRED',
      path: 'booker.fullName',
      message: 'Please enter the booker’s full name (at least 2 characters).',
    });
  }

  if (!isValidEmail(booker.email)) {
    violations.push({
      code: 'BOOKER_EMAIL_INVALID',
      path: 'booker.email',
      message: 'Please enter a valid email address for booking confirmation.',
    });
  }

  if (!isValidPhone(booker.phone)) {
    violations.push({
      code: 'BOOKER_PHONE_INVALID',
      path: 'booker.phone',
      message: 'Please enter a valid contact phone number (7–15 digits).',
    });
  }

  if (!isValidAgeInteger(booker.age)) {
    violations.push({
      code: 'AGE_INVALID',
      path: 'booker.age',
      message: 'Please enter a valid whole-number age between 0 and 120.',
    });
  } else if (!isLegalAdultBooker(booker.age)) {
    violations.push({
      code: 'BOOKER_UNDER_18',
      path: 'booker.age',
      message: `Booker must be ${LEGAL_ADULT_MIN_AGE} or older to book tickets (entered age ${booker.age}).`,
    });
  }

  return violations;
}
