import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMailMock = vi.fn(async (options: any) => ({
  messageId: `msg-${sendMailMock.mock.calls.length}`,
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

vi.mock('../src/modules/smtp/service.js', () => ({
  resolveSmtpConfig: vi.fn(async () => ({
    service: 'smtp',
    host: 'localhost',
    port: 587,
    secure: false,
    fromAddress: 'from@example.com',
    fromName: 'Test Sender'
  }))
}));

describe('sendEmail batching', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it('splits recipients into SMTP batches of 100', async () => {
    const { sendEmail } = await import('../src/providers/smtp.js');

    const recipients = Array.from({ length: 150 }, (_value, index) => {
      return `user${index + 1}@example.com`;
    });

    const result = await sendEmail({
      to: recipients,
      subject: 'Batch Test',
      html: '<p>Test</p>'
    });

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect((sendMailMock.mock.calls[0][0].to as string[]).length).toBe(100);
    expect((sendMailMock.mock.calls[1][0].to as string[]).length).toBe(50);
    expect(result.accepted.length).toBe(150);
    expect(result.rejected.length).toBe(0);
    expect(result.status).toBe('sent');
  });
});
