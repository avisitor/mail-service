import { z } from 'zod';

export const templateCreateSchema = z.object({
  appId: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
  subject: z.string().min(1),
  version: z.number().int().positive(),
  isActive: z.boolean().optional(),
});

export const templateUpdateSchema = templateCreateSchema.partial();

export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
