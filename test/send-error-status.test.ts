import { describe, it, expect, vi, beforeEach } from 'vitest';

// Routes under test use the noop authenticate decorator when auth is disabled.
process.env.DISABLE_AUTH = 'true';

vi.mock('../src/providers/smtp.js', () => {
  class EmailRoutingError extends Error {
    readonly statusCode = 400;
    constructor(message: string) {
      super(message);
      this.name = 'EmailRoutingError';
    }
  }
  return {
    EmailRoutingError,
    sendEmail: vi.fn()
  };
});

async function buildTestApp() {
  const { buildApp } = await import('../src/app.js');
  return buildApp();
}

async function getSendEmailMock() {
  const mod = await import('../src/providers/smtp.js');
  return mod.sendEmail as ReturnType<typeof vi.fn>;
}

async function getRoutingErrorClass() {
  const mod = await import('../src/providers/smtp.js');
  return mod.EmailRoutingError as new (message: string) => Error;
}

function postBody() {
  return {
    method: 'POST',
    url: '/api/send',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ to: 'test@test.com', subject: 'Hi', text: 'body' })
  } as any;
}

describe('POST /api/send and /test-email error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 (not 500) when sendEmail throws EmailRoutingError on /api/send', async () => {
    const sendEmail = await getSendEmailMock();
    const RoutingError = await getRoutingErrorClass();
    sendEmail.mockRejectedValue(new RoutingError('Test emails (test@test.com) must be sent through SMTP test servers like MailHog.'));
    const app = await buildTestApp();

    const res = await app.inject(postBody());

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('must be sent through');
  });

  it('returns 400 for EmailRoutingError on /test-email', async () => {
    const sendEmail = await getSendEmailMock();
    const RoutingError = await getRoutingErrorClass();
    sendEmail.mockRejectedValue(new RoutingError('simulator.amazonses.com emails must be sent through SES service.'));
    const app = await buildTestApp();

    const res = await app.inject({ ...postBody(), url: '/test-email' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for EmailRoutingError on /api/send-test', async () => {
    const sendEmail = await getSendEmailMock();
    const RoutingError = await getRoutingErrorClass();
    sendEmail.mockRejectedValue(new RoutingError('Test emails must be sent through localhost/MailHog.'));
    const app = await buildTestApp();

    const res = await app.inject({ ...postBody(), url: '/api/send-test' });

    expect(res.statusCode).toBe(400);
  });

  it('returns a generic 500 without leaking the internal error message on /api/send', async () => {
    const sendEmail = await getSendEmailMock();
    sendEmail.mockRejectedValue(new Error('connect ECONNREFUSED ses-internal-prod.example.com:443'));
    const app = await buildTestApp();

    const res = await app.inject(postBody());

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('ses-internal-prod.example.com');
    expect(res.body).not.toContain('ECONNREFUSED');
  });
});
