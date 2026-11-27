export const MIN_AGE = 0;
export const MAX_AGE = 120;
export const CHILD_MIN_AGE = 5;
export const ADULT_PASS_MIN_AGE = 12;
export const LEGAL_ADULT_MIN_AGE = 18;
export const AGE_REFERENCE_DATE = '2026-12-10';

export type AgeBand = 'infant' | 'child' | 'adult';
export type AttendeeCategoryChoice = 'infant' | 'child' | 'adult';

export function isValidAgeInteger(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;
}

export function classifyAge(age: number): AgeBand {
  if (!isValidAgeInteger(age)) {
    throw new RangeError(`Invalid age: ${String(age)}. Expected integer between ${MIN_AGE} and ${MAX_AGE}.`);
  }
  if (age < CHILD_MIN_AGE) {
    return 'infant';
  }
  if (age < ADULT_PASS_MIN_AGE) {
    return 'child';
  }
  return 'adult';
}

export function isLegalAdultBooker(age: unknown): age is number {
  return isValidAgeInteger(age) && age >= LEGAL_ADULT_MIN_AGE;
}

/**
 * Every attendee under 18 (including 12–17 year olds on an Adult festival pass)
 * is a minor and requires Guardian Name and Guardian Phone Number.
 */
export function requiresGuardian(age: unknown): boolean {
  return isValidAgeInteger(age) && age < LEGAL_ADULT_MIN_AGE;
}

export function matchesSelectedCategory(age: number, selectedCategory: AttendeeCategoryChoice): boolean {
  return classifyAge(age) === selectedCategory;
}

export function formatCategoryLabel(category: AttendeeCategoryChoice): string {
  switch (category) {
    case 'adult':
      return 'Adult (12+)';
    case 'child':
      return 'Child (5–11)';
    case 'infant':
      return 'Under 5 (Free)';
  }
}

export function buildCategoryMismatchMessage(
  age: number,
  selectedCategory: AttendeeCategoryChoice,
): string {
  const expected = classifyAge(age);
  const selectedText = formatCategoryLabel(selectedCategory);
  switch (expected) {
    case 'infant':
      return `Age ${age} qualifies for Free Entry (Under 5). Please change the attendee type from ${selectedText} to Under 5 (Free).`;
    case 'child':
      return `Age ${age} requires a Child pass (ages 5–11). Please change the attendee type from ${selectedText} to Child (5–11).`;
    case 'adult':
      return `Attendees aged 12 and above require an Adult pass. Please change the attendee type from ${selectedText} to Adult (12+).`;
  }
}
