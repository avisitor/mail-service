import { FastifyInstance, FastifyRequest } from 'fastify';
import {
  startSubscription,
  confirmSubscription,
  unsubscribeByToken,
  findByUnsubscribeToken,
  renderSubscribePage,
  renderSubmittedPage,
  renderUnsubscribedPage,
  SubscribeError
} from './subscribeService.js';
import { resolveAppId } from './service.js';

function baseUrlFromReq(req: FastifyRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
  const hostHdr =
    (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
  const host = hostHdr.split(',')[0].trim();
  return `${proto}://${host}`;
}

function clientIp(req: FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || 'unknown';
}

interface RateBucket {
  count: number;
  resetAt: number;
}
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_IP = 20;
const buckets = new Map<string, RateBucket>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_MAX_PER_IP) return false;
  b.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of buckets) if (b.resetAt < now) buckets.delete(ip);
}, RATE_WINDOW_MS).unref?.();

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer'
};

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

function errorPage(title: string, message: string, status: number): { status: number; html: string } {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;margin:0;padding:40px 16px;color:#222}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}h1{margin:0 0 16px;font-size:22px}p{line-height:1.5}</style>
</head><body><div class="card"><h1>${escape(title)}</h1><p>${escape(message)}</p></div></body></html>`;
  return { status, html };
}

export async function registerSubscribeRoutes(app: FastifyInstance) {
  app.get('/subscribe/:appIdOrClientId/:slug', async (req, reply) => {
    const { appIdOrClientId, slug } = req.params as { appIdOrClientId: string; slug: string };
    const appId = await resolveAppId(appIdOrClientId);
    if (!appId) {
      const e = errorPage('Not found', 'Subscription page not found.', 404);
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    const result = await renderSubscribePage(appId, slug, baseUrlFromReq(req));
    if (!result) {
      const e = errorPage('Not found', 'Subscription page not found.', 404);
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    return reply.code(200).headers(HTML_HEADERS).send(result.html);
  });

  app.post('/subscribe/:appIdOrClientId/:slug', async (req, reply) => {
    const ip = clientIp(req);
    if (!checkRate(ip)) {
      const e = errorPage('Too many requests', 'Please try again later.', 429);
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    const { appIdOrClientId, slug } = req.params as { appIdOrClientId: string; slug: string };
    const body = (req.body || {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const email = typeof body.email === 'string' ? body.email : '';
    const appId = await resolveAppId(appIdOrClientId);
    if (!appId) {
      const e = errorPage('Not found', 'Subscription page not found.', 404);
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    try {
      const { list, email: usedEmail } = await startSubscription(
        appId,
        slug,
        name,
        email,
        baseUrlFromReq(req)
      );
      const html = renderSubmittedPage({ listName: list.name, memberEmail: usedEmail });
      return reply.code(200).headers(HTML_HEADERS).send(html);
    } catch (err) {
      if (err instanceof SubscribeError) {
        const e = errorPage('Cannot subscribe', err.message, err.status);
        return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
      }
      req.log.error({ err }, 'subscribe submit failed');
      const e = errorPage('Server error', 'Please try again later.', 500);
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
  });

  app.get('/subscribe/confirm/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const result = await confirmSubscription(token, baseUrlFromReq(req));
    if (!result) {
      const e = errorPage(
        'Confirmation link invalid',
        'This confirmation link is invalid or has expired. Please sign up again.',
        404
      );
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Subscribed</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;margin:0;padding:40px 16px;color:#222}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}h1{margin:0 0 16px;font-size:22px}p{line-height:1.5}</style>
</head><body><div class="card"><h1>You're subscribed</h1><p>Thanks ${escape(result.email)}, your subscription to <strong>${escape(result.list.name)}</strong> is confirmed.</p></div></body></html>`;
    return reply.code(200).headers(HTML_HEADERS).send(html);
  });

  app.get('/subscribe/unsubscribe/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const member = await findByUnsubscribeToken(token);
    if (!member) {
      const e = errorPage(
        'Already unsubscribed',
        'You are not subscribed, or this link is no longer valid.',
        404
      );
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unsubscribe from ${escape(member.list.name)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;margin:0;padding:40px 16px;color:#222}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}h1{margin:0 0 16px;font-size:22px}button{margin-top:16px;padding:10px 18px;background:#d73a49;color:#fff;border:0;border-radius:4px;font-size:15px;cursor:pointer}button:hover{background:#b62828}p{line-height:1.5}</style>
</head><body><div class="card"><h1>Unsubscribe from ${escape(member.list.name)}</h1>
<p>Are you sure you want to unsubscribe <strong>${escape(member.email)}</strong> from this list?</p>
<form method="post" action=""><button type="submit">Yes, unsubscribe me</button></form>
</div></body></html>`;
    return reply.code(200).headers(HTML_HEADERS).send(html);
  });

  app.post('/subscribe/unsubscribe/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const result = await unsubscribeByToken(token);
    if (!result) {
      const e = errorPage(
        'Already unsubscribed',
        'You are not subscribed, or this link is no longer valid.',
        404
      );
      return reply.code(e.status).headers(HTML_HEADERS).send(e.html);
    }
    const html = renderUnsubscribedPage({ listName: result.list.name });
    return reply.code(200).headers(HTML_HEADERS).send(html);
  });
}
