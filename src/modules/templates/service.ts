import Mustache from 'mustache';
import { getPrisma } from '../../db/prisma.js';
import { TemplateCreateInput, TemplateUpdateInput } from './types.js';
import { flags } from '../../config.js';

interface MemoryTemplate extends TemplateCreateInput { id: string; bodyText?: string; }
const mem: Record<string, MemoryTemplate> = {};

export async function createTemplate(data: TemplateCreateInput) {
  if (flags.useInMemory) {
    const id = `tpl_${Object.keys(mem).length + 1}`;
    const record: MemoryTemplate = { id, ...data };
    mem[id] = record;
    return record as any;
  }
  const prisma = getPrisma();
  return prisma.template.create({ data: { ...data } });
}

export async function updateTemplate(id: string, data: TemplateUpdateInput) {
  if (flags.useInMemory) {
    if (!mem[id]) throw new Error('Not found');
    mem[id] = { ...mem[id], ...(data as any) };
    return mem[id] as any;
  }
  const prisma = getPrisma();
  return prisma.template.update({ where: { id }, data: { ...data } });
}

export async function getTemplate(id: string) {
  if (flags.useInMemory) {
    return mem[id] as any || null;
  }
  const prisma = getPrisma();
  return prisma.template.findUnique({ where: { id } });
}

export async function listTemplates(tenantId: string) {
  if (flags.useInMemory) {
    return Object.values(mem).filter(t => t.tenantId === tenantId) as any;
  }
  const prisma = getPrisma();
  return prisma.template.findMany({ where: { tenantId }, orderBy: [{ name: 'asc' }, { version: 'desc' }] });
}

export async function renderTemplate(id: string, context: Record<string, any>) {
  const tpl = await getTemplate(id);
  if (!tpl) return null;
  const html = Mustache.render(tpl.bodyHtml, context);
  const text = tpl.bodyText ? Mustache.render(tpl.bodyText, context) : undefined;
  const subject = Mustache.render(tpl.subject, context);
  return { subject, html, text };
}
