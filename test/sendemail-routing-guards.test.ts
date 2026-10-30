import { describe, it, expect, vi, beforeEach } from 'vitest';

type SendMailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
};

const sendMailMock = vi.fn(async (options: any): Promise<SendMailResult> => ({
  messageId: 'msg-1',
  accepted: Array.isArray(options.to) ? options.to : [options.to],
  rejected: [],
  response: 'ok'
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock }))
  },
  createTransport: vi.fn(() => ({ sendMail: sendMailMock }))
}));

// Mutable per-test: each case sets the resolved SMTP configuration.
const resolveSmtpConfigMock = vi.fn();

vi.mock('../src/modules/smtp/service.js', () => ({
  resolveSmtpConfig: (...args: any[]) => resolveSmtpConfigMock(...args)
}));

const smtpConfigBase = {
  port: 587,
  secure: false,
  fromAddress: 'from@example.com',
  fromName: 'Test Sender'
};

async function importSendEmail() {
  const mod = await import('../src/providers/smtp.js');
  return mod;
}

describe('sendEmail routing guards', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMailMock.mockClear();
    resolveSmtpConfigMock.mockReset();
  });

  it('rejects test recipients on a non-localhost SMTP host with EmailRoutingError (400)', async () => {
    resolveSmtpConfigMock.mockResolvedValue({
      ...smtpConfigBase,
      service: 'smtp',
      host: 'smtp.production.example.com'
    });
    const { sendEmail, EmailRoutingError } = await importSendEmail();

    const promise = sendEmail({ to: 'test@test.com', subject: 'Hi', text: 'body', appId: 'app-smtp-prod' });

    await expect(promise).rejects.toBeInstanceOf(EmailRoutingError);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('rejects test recipients routed through SES with EmailRoutingError (400)', async () => {
    resolveSmtpConfigMock.mockResolvedValue({
      ...smtpConfigBase,
      service: 'ses',
      host: 'email.us-east-1.amazonaws.com',
      awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
      awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      awsRegion: 'us-east-1'
    });
    const { sendEmail, EmailRoutingError } = await importSendEmail();

    const promise = sendEmail({ to: 'a@test.com', subject: 'Hi', text: 'body', appId: 'app-ses' });

    await expect(promise).rejects.toBeInstanceOf(EmailRoutingError);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('rejects simulator recipients on a non-SES service with EmailRoutingError (400)', async () => {
    resolveSmtpConfigMock.mockResolvedValue({
      ...smtpConfigBase,
      service: 'smtp',
      host: 'localhost'
    });
    const { sendEmail, EmailRoutingError } = await importSendEmail();

    const promise = sendEmail({
      to: 'success@simulator.amazonses.com',
      subject: 'Hi',
      text: 'body',
      appId: 'app-smtp-sim'
    });

    await expect(promise).rejects.toBeInstanceOf(EmailRoutingError);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('still sends normal recipients through a localhost SMTP config', async () => {
    resolveSmtpConfigMock.mockResolvedValue({
      ...smtpConfigBase,
      service: 'smtp',
      host: 'localhost'
    });
    const { sendEmail } = await importSendEmail();

    const result = await sendEmail({ to: 'user@example.com', subject: 'Hi', text: 'body', appId: 'app-smtp-ok' });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('sent');
    expect(result.accepted).toEqual(['user@example.com']);
  });
});
