import type { BookingIntent } from '../booking-types';
import type { CatalogProduct, ProductCode } from '../catalog';
import type { RuleViolation } from '../errors';
import { checkAdmissionRules } from './admission-rules';
import { checkAttendeeRules } from './attendee-rules';
import { checkBookerRules } from './booker-rules';
import { checkExtrasRules } from './extras-rules';
import { checkGuardianRules } from './guardian-rules';

export interface RuleCheckContext {
  readonly intent: BookingIntent;
  readonly catalogMap: ReadonlyMap<ProductCode, CatalogProduct>;
  readonly todayIsoDate: string;
}

export type DomainRule = (ctx: RuleCheckContext) => RuleViolation[];

/**
 * Central rule pipeline. Adding a new festival committee rule is a single
 * pure function registered here—isolated from Express routes and React components.
 */
export const DOMAIN_RULE_PIPELINE: readonly DomainRule[] = [
  (ctx) => checkBookerRules(ctx.intent),
  (ctx) => checkAttendeeRules(ctx.intent),
  (ctx) => checkGuardianRules(ctx.intent),
  (ctx) => checkAdmissionRules(ctx.intent, ctx.catalogMap, ctx.todayIsoDate),
  (ctx) => checkExtrasRules(ctx.intent, ctx.catalogMap),
];

export function validateBookingRules(ctx: RuleCheckContext): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of DOMAIN_RULE_PIPELINE) {
    violations.push(...rule(ctx));
  }
  return violations;
}
