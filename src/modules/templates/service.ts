import { substituteTemplateVariables } from '../../utils/templates.js';
import { getPrisma } from '../../db/prisma.js';
import { TemplateCreateInput, TemplateUpdateInput } from './types.js';

export async function createTemplate(data: any) {
  const prisma = getPrisma();
  // Remove redundant fields and normalize data
  const { variables, bodyText, name, description, bodyHtml, ...templateData } = data;
  
  // Use content field (backward compatibility with bodyHtml)
  if (!templateData.content && bodyHtml) {
    templateData.content = bodyHtml;
  }
  
  return prisma.template.create({ data: templateData });
}

export async function updateTemplate(id: number, data: TemplateUpdateInput) {
  const prisma = getPrisma();
  return prisma.template.update({ where: { id }, data: { ...data } });
}

export async function getTemplate(id: number) {
  const prisma = getPrisma();
  return prisma.template.findUnique({ where: { id } });
}

export async function listTemplates(tenantId: string, appId?: string) {
  const prisma = getPrisma();
  // Template table doesn't have tenantId column, query by appId only
  const where = appId ? { appId } : {};
  const allTemplates = await prisma.template.findMany({ where, orderBy: [{ title: 'asc' }, { version: 'desc' }] });
  
  // Filter out templates with null or empty content in JavaScript
  const validTemplates = allTemplates.filter(template => 
    template.content !== null && template.content !== undefined && template.content.trim() !== ''
  );
  
  return validTemplates;
}

export async function renderTemplate(id: number, context: Record<string, any>) {
  const tpl = await getTemplate(id);
  if (!tpl) return null;
  
  // Skip templates with null or empty content
  if (!tpl.content) {
    console.warn(`Template ${id} has null or empty content, skipping render`);
    return null;
  }
  
  const recipientContext = context as any; // Cast to RecipientContext since it contains the email field
  const html = substituteTemplateVariables(tpl.content, recipientContext);
  const text = undefined; // bodyText removed
  const subject = tpl.subject ? substituteTemplateVariables(tpl.subject, recipientContext) : '';
  
  return { html, text, subject };
}
