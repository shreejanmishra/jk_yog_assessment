import {
  buildCategoryMismatchMessage,
  isValidAgeInteger,
  matchesSelectedCategory,
} from '../age';
import type { BookingIntent } from '../booking-types';
import { EVENT_METADATA } from '../catalog';
import type { RuleViolation } from '../errors';
import { isValidEmail, isValidPhone } from './contact-validation';

export function checkAttendeeRules(intent: BookingIntent): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { attendees, mode, booker } = intent;

  if (attendees.length === 0) {
    violations.push({
      code: 'NO_ATTENDEES',
      path: 'attendees',
      message: 'Add at least one attendee to continue.',
    });
    return violations;
  }

  if (attendees.length > EVENT_METADATA.maxAttendeesPerBooking) {
    violations.push({
      code: 'GROUP_TOO_LARGE',
      path: 'attendees',
      message: `A single booking can include at most ${EVENT_METADATA.maxAttendeesPerBooking} attendees.`,
    });
  }

  if (mode === 'individual') {
    if (attendees.length !== 1 || !attendees[0]?.isBooker) {
      violations.push({
        code: 'INDIVIDUAL_MODE_COUNT',
        path: 'mode',
        message: 'Individual booking covers only the primary booker. Switch to Group Booking to add others.',
      });
    } else if (isValidAgeInteger(booker.age) && attendees[0].age !== booker.age) {
      violations.push({
        code: 'INDIVIDUAL_MODE_COUNT',
        path: 'attendees[0].age',
        message: 'In Individual mode, the attendee age must match the booker age.',
      });
    }
  }

  attendees.forEach((attendee, index) => {
    const basePath = `attendees[${index}]`;

    if (attendee.fullName.trim().length < 2) {
      violations.push({
        code: 'ATTENDEE_NAME_REQUIRED',
        path: `${basePath}.fullName`,
        message: 'Please enter the attendee’s full name.',
      });
    }

    if (!isValidAgeInteger(attendee.age)) {
      violations.push({
        code: 'AGE_INVALID',
        path: `${basePath}.age`,
        message: 'Please enter a whole-number age between 0 and 120.',
      });
    } else if (!matchesSelectedCategory(attendee.age, attendee.selectedCategory)) {
      violations.push({
        code: 'ATTENDEE_TYPE_AGE_MISMATCH',
        path: `${basePath}.age`,
        message: buildCategoryMismatchMessage(attendee.age, attendee.selectedCategory),
      });
    }

    if (attendee.selectedCategory === 'adult') {
      if (!attendee.phone || attendee.phone.trim().length === 0) {
        violations.push({
          code: 'ATTENDEE_PHONE_REQUIRED',
          path: `${basePath}.phone`,
          message: 'Phone number is required for adult passholders.',
        });
      } else if (!isValidPhone(attendee.phone)) {
        violations.push({
          code: 'ATTENDEE_PHONE_INVALID',
          path: `${basePath}.phone`,
          message: 'Please enter a valid phone number (7–15 digits).',
        });
      }
    } else if (attendee.phone && attendee.phone.trim().length > 0 && !isValidPhone(attendee.phone)) {
      violations.push({
        code: 'ATTENDEE_PHONE_INVALID',
        path: `${basePath}.phone`,
        message: 'Please enter a valid optional phone number (7–15 digits).',
      });
    }

    if (attendee.email && attendee.email.trim().length > 0 && !isValidEmail(attendee.email)) {
      violations.push({
        code: 'ATTENDEE_EMAIL_INVALID',
        path: `${basePath}.email`,
        message: 'Please enter a valid email address.',
      });
    }
  });

  return violations;
}
