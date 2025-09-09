import { z } from 'zod';

export const groupCreateSchema = z.object({
  tenantId: z.string(),
  appId: z.string(),
  templateId: z.string().optional(),
  subject: z.string().min(1),
  bodyOverrideHtml: z.string().optional(),
  bodyOverrideText: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  createdBy: z.string().optional(),
});

export const recipientIngestSchema = z.object({
  recipients: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    context: z.record(z.any()).default({}),
  })).min(1).max(1000),
  dedupe: z.boolean().default(true),
  renderNow: z.boolean().default(false),
});

export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
export type RecipientIngestInput = z.infer<typeof recipientIngestSchema>;
