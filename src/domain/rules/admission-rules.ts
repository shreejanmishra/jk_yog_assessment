import { classifyAge, isValidAgeInteger } from '../age';
import type { AttendeeIntent, BookingIntent, FamilyGroupIntent } from '../booking-types';
import {
  EVENT_METADATA,
  FESTIVAL_DATE_SET,
  FESTIVAL_DAYS,
  PRODUCT_CODES,
  type CatalogProduct,
  type ProductCode,
} from '../catalog';
import type { RuleViolation } from '../errors';

export function resolveAttendeeValidDays(
  attendee: AttendeeIntent,
  familyGroupsById: ReadonlyMap<string, FamilyGroupIntent>,
): string[] {
  switch (attendee.passKind) {
    case 'all_day':
      return FESTIVAL_DAYS.map((d) => d.date);
    case 'family_pass': {
      const group = attendee.familyGroupId ? familyGroupsById.get(attendee.familyGroupId) : undefined;
      return group ? [...new Set(group.days)].sort() : [];
    }
    case 'day_pass':
    case 'free_infant':
      return [...new Set(attendee.days)].sort();
  }
}

function validateChosenDays(
  days: readonly string[],
  path: string,
  todayIsoDate: string,
  violations: RuleViolation[],
): void {
  if (days.length === 0) {
    violations.push({
      code: 'DAY_PASS_NO_DAYS',
      path,
      message: 'Please select at least one festival day.',
    });
    return;
  }

  const seen = new Set<string>();
  for (const day of days) {
    if (!FESTIVAL_DATE_SET.has(day)) {
      violations.push({
        code: 'INVALID_FESTIVAL_DAY',
        path,
        message: `${day} is outside the Sharad Utsav 2026 dates (${EVENT_METADATA.startsOn} to ${EVENT_METADATA.endsOn}).`,
      });
    } else if (day < todayIsoDate) {
      violations.push({
        code: 'DAY_IN_PAST',
        path,
        message: `Festival day ${day} has already passed and cannot be booked.`,
      });
    }
    if (seen.has(day)) {
      violations.push({
        code: 'DUPLICATE_DAY',
        path,
        message: `Duplicate day ${day} is not allowed.`,
      });
    }
    seen.add(day);
  }
}

export function checkAdmissionRules(
  intent: BookingIntent,
  catalogMap: ReadonlyMap<ProductCode, CatalogProduct>,
  todayIsoDate: string,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const familyGroupsById = new Map<string, FamilyGroupIntent>();

  intent.familyGroups.forEach((group, groupIndex) => {
    familyGroupsById.set(group.id, group);
    validateChosenDays(group.days, `familyGroups[${groupIndex}].days`, todayIsoDate, violations);
  });

  const membersByFamilyGroup = new Map<string, AttendeeIntent[]>();

  intent.attendees.forEach((attendee, index) => {
    const basePath = `attendees[${index}]`;
    if (!isValidAgeInteger(attendee.age)) {
      return;
    }

    const band = classifyAge(attendee.age);

    if (band === 'infant') {
      if (attendee.passKind !== 'free_infant') {
        violations.push({
          code: 'PASS_KIND_INCOMPATIBLE',
          path: `${basePath}.passKind`,
          message: 'Children under 5 enter free and do not require a paid pass.',
        });
      } else {
        validateChosenDays(attendee.days, `${basePath}.days`, todayIsoDate, violations);
      }
      return;
    }

    if (attendee.passKind === 'free_infant') {
      violations.push({
        code: 'PASS_KIND_INCOMPATIBLE',
        path: `${basePath}.passKind`,
        message: 'Free infant entry is only valid for children under age 5.',
      });
      return;
    }

    if (attendee.passKind === 'day_pass') {
      validateChosenDays(attendee.days, `${basePath}.days`, todayIsoDate, violations);
    } else if (attendee.passKind === 'all_day') {
      if (EVENT_METADATA.startsOn < todayIsoDate) {
        violations.push({
          code: 'DAY_IN_PAST',
          path: `${basePath}.passKind`,
          message: 'All-Day passes are unavailable once the festival has already started.',
        });
      }
    } else if (attendee.passKind === 'family_pass') {
      if (!attendee.familyGroupId || !familyGroupsById.has(attendee.familyGroupId)) {
        violations.push({
          code: 'FAMILY_GROUP_UNKNOWN',
          path: `${basePath}.familyGroupId`,
          message: 'Attendee references a Family Pass group that does not exist.',
        });
      } else {
        const list = membersByFamilyGroup.get(attendee.familyGroupId) ?? [];
        list.push(attendee);
        membersByFamilyGroup.set(attendee.familyGroupId, list);
      }
    }
  });

  const familyProduct = catalogMap.get(PRODUCT_CODES.FAMILY_PASS);
  const maxAdults = familyProduct?.maxAdults ?? 2;
  const maxChildren = familyProduct?.maxChildren ?? 2;

  intent.familyGroups.forEach((group, groupIndex) => {
    const members = membersByFamilyGroup.get(group.id) ?? [];
    if (members.length === 0) {
      violations.push({
        code: 'FAMILY_GROUP_EMPTY',
        path: `familyGroups[${groupIndex}]`,
        message: 'Family Pass must have eligible attendees assigned to it.',
      });
      return;
    }

    let adultCount = 0;
    let childCount = 0;
    for (const m of members) {
      if (!isValidAgeInteger(m.age)) continue;
      const band = classifyAge(m.age);
      if (band === 'adult') adultCount += 1;
      if (band === 'child') childCount += 1;
    }

    if (
      adultCount < 1 ||
      adultCount > maxAdults ||
      childCount > maxChildren ||
      adultCount + childCount < 2
    ) {
      violations.push({
        code: 'FAMILY_GROUP_COMPOSITION',
        path: `familyGroups[${groupIndex}]`,
        message: `A Family Pass covers 1–${maxAdults} adults (12+) and up to ${maxChildren} children (5–11), with at least 2 members total.`,
      });
    }
  });

  return violations;
}
