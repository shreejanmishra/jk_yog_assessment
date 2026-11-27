import { classifyAge, isValidAgeInteger } from '../age';
import type { BookingIntent, FamilyGroupIntent } from '../booking-types';
import {
  EVENT_METADATA,
  FESTIVAL_DATE_SET,
  GARBA_WORKSHOP_DATES,
  PRODUCT_CODES,
  type CatalogProduct,
  type ProductCode,
} from '../catalog';
import type { RuleViolation } from '../errors';
import { resolveAttendeeValidDays } from './admission-rules';

export function checkExtrasRules(
  intent: BookingIntent,
  catalogMap: ReadonlyMap<ProductCode, CatalogProduct>,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const familyGroupsById = new Map<string, FamilyGroupIntent>(
    intent.familyGroups.map((g) => [g.id, g]),
  );

  const workshopProduct = catalogMap.get(PRODUCT_CODES.GARBA_WORKSHOP);
  const allowedWorkshopSet = new Set(workshopProduct?.allowedDates ?? GARBA_WORKSHOP_DATES);

  intent.attendees.forEach((attendee, index) => {
    const basePath = `attendees[${index}].extras`;
    const validDays = new Set(resolveAttendeeValidDays(attendee, familyGroupsById));

    const { dandiyaPairs, dinnerDates, workshopDates } = attendee.extras;

    if (
      !Number.isInteger(dandiyaPairs) ||
      dandiyaPairs < 0 ||
      dandiyaPairs > EVENT_METADATA.maxDandiyaPairsPerAttendee
    ) {
      violations.push({
        code: 'QUANTITY_OUT_OF_RANGE',
        path: `${basePath}.dandiyaPairs`,
        message: `Dandiya Stick pairs must be a whole number between 0 and ${EVENT_METADATA.maxDandiyaPairsPerAttendee}.`,
      });
    }

    const seenDinner = new Set<string>();
    for (const date of dinnerDates) {
      if (seenDinner.has(date)) {
        violations.push({
          code: 'DUPLICATE_DAY',
          path: `${basePath}.dinnerDates`,
          message: `Duplicate dinner plate date ${date} for ${attendee.fullName || 'attendee'}.`,
        });
      }
      seenDinner.add(date);

      if (!FESTIVAL_DATE_SET.has(date) || !validDays.has(date)) {
        violations.push({
          code: 'EXTRA_DAY_NOT_ATTENDING',
          path: `${basePath}.dinnerDates`,
          message: `Dinner Plate on ${date} requires ${attendee.fullName || 'the attendee'} to hold a pass valid on ${date}.`,
        });
      }
    }

    if (workshopDates.length > 0 && isValidAgeInteger(attendee.age) && classifyAge(attendee.age) === 'infant') {
      violations.push({
        code: 'WORKSHOP_INFANT_INELIGIBLE',
        path: `${basePath}.workshopDates`,
        message: 'Garba Workshop is only open to ticketed attendees aged 5 and above.',
      });
    }

    const seenWorkshop = new Set<string>();
    for (const date of workshopDates) {
      if (seenWorkshop.has(date)) {
        violations.push({
          code: 'DUPLICATE_DAY',
          path: `${basePath}.workshopDates`,
          message: `Duplicate Garba Workshop date ${date}.`,
        });
      }
      seenWorkshop.add(date);

      if (!allowedWorkshopSet.has(date)) {
        violations.push({
          code: 'WORKSHOP_DAY_INVALID',
          path: `${basePath}.workshopDates`,
          message: `Garba Workshop runs on Fri 11 Dec and Sun 13 Dec only (${date} is unavailable).`,
        });
      } else if (!validDays.has(date)) {
        violations.push({
          code: 'EXTRA_DAY_NOT_ATTENDING',
          path: `${basePath}.workshopDates`,
          message: `Garba Workshop on ${date} requires a pass valid on ${date}.`,
        });
      }
    }
  });

  return violations;
}
