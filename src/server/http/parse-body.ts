import type { ZodType, ZodTypeDef } from 'zod';
import { BadRequestError } from './app-errors';

export function parseBody<TOutput, TDef extends ZodTypeDef = ZodTypeDef, TInput = unknown>(
  schema: ZodType<TOutput, TDef, TInput>,
  body: unknown,
): TOutput {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'body',
      code: 'INVALID_INPUT',
      message: issue.message,
    }));
    throw new BadRequestError('Invalid request payload.', issues);
  }
  return parsed.data;
}
