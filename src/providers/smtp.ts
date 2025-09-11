import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config.js';

let transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput) {
  if (process.env.TEST_FAIL_ONCE === 'true') {
    // flip flag so only first attempt fails
    delete process.env.TEST_FAIL_ONCE;
    throw new Error('Simulated transient timeout');
  }
  if (process.env.TEST_FAIL_ALWAYS === 'true') {
    throw new Error('Simulated permanent failure');
  }
  if ((process.env.SMTP_DRY_RUN || 'false').toLowerCase() === 'true') {
    return; // pretend success
  }
  const t = getTransporter();
  const fromAddr = config.smtp.fromDefault || config.smtp.user;
  const from = config.smtp.fromName && fromAddr ? `${config.smtp.fromName} <${fromAddr}>` : fromAddr;
  await t.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}