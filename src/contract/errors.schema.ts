import { z } from 'zod';

export const ApiIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    issues: z.array(ApiIssueSchema).optional(),
  }),
});

export type ApiIssueDTO = z.infer<typeof ApiIssueSchema>;
export type ApiErrorEnvelopeDTO = z.infer<typeof ApiErrorEnvelopeSchema>;
