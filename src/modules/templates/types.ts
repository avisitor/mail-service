import { z } from 'zod';

export const templateCreateSchema = z.object({
  tenantId: z.string(),
  appId: z.string(),
  name: z.string().min(1),
  version: z.number().int().positive(),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  variables: z.record(z.string(), z.any()).default({}),
  isActive: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
});

export const templateUpdateSchema = templateCreateSchema.partial().extend({ id: z.string() });

export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
