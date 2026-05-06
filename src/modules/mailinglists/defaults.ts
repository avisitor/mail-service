export const TEMPLATE_KINDS = [
  'SUBSCRIBE_PAGE',
  'CONFIRM_EMAIL',
  'WELCOME_EMAIL',
  'CREATOR_NOTICE'
] as const;

export type SubscribeTemplateKind = typeof TEMPLATE_KINDS[number];

export const DEFAULT_SUBSCRIBE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign up for {{listName}}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f6f7f9; margin:0; padding:40px 16px; color:#222; }
  .card { max-width: 480px; margin: 0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
  h1 { margin: 0 0 16px; font-size: 22px; }
  p { line-height: 1.5; }
  label { display:block; margin-top: 16px; font-weight: 600; font-size: 14px; }
  input { width: 100%; padding: 10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size: 15px; }
  button { margin-top: 20px; width:100%; padding: 12px; background:#0366d6; color:#fff; border:0; border-radius:4px; font-size:15px; cursor:pointer; }
  button:hover { background:#024da1; }
  .muted { color:#666; font-size: 13px; margin-top: 16px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign up for {{listName}}</h1>
    <p>Enter your details below. We will send you a confirmation email; click the link inside to complete your subscription.</p>
    <form method="post" action="{{submitUrl}}">
      <label>Name <input type="text" name="name" maxlength="64" autocomplete="name"></label>
      <label>Email <input type="email" name="email" required maxlength="254" autocomplete="email"></label>
      <button type="submit">Subscribe</button>
    </form>
    <p class="muted">You will receive a confirmation email message.</p>
  </div>
</body>
</html>`;

export const DEFAULT_SUBSCRIBE_PAGE_SUBMITTED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Check your email</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;margin:0;padding:40px 16px;color:#222}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}h1{margin:0 0 16px;font-size:22px}p{line-height:1.5}</style>
</head><body><div class="card"><h1>Check your email</h1><p>We sent a confirmation link to <strong>{{memberEmail}}</strong>. Click the link to complete your subscription to {{listName}}.</p></div></body></html>`;

export const DEFAULT_CONFIRM_EMAIL_SUBJECT = 'Please confirm your subscription to {{listName}}';
export const DEFAULT_CONFIRM_EMAIL_HTML = `<p>Hi {{memberName}},</p>
<p>Please confirm your subscription to <strong>{{listName}}</strong> by clicking the link below:</p>
<p><a href="{{confirmUrl}}">{{confirmUrl}}</a></p>
<p>If you did not request this, you can ignore this message.</p>`;

export const DEFAULT_WELCOME_EMAIL_SUBJECT = 'Welcome to {{listName}}';
export const DEFAULT_WELCOME_EMAIL_HTML = `<p>Hi {{memberName}},</p>
<p>Thank you for confirming your subscription to <strong>{{listName}}</strong>.</p>
<p>If you ever wish to leave the list, you can unsubscribe at any time:</p>
<p><a href="{{unsubscribeUrl}}">{{unsubscribeUrl}}</a></p>`;

export const DEFAULT_CREATOR_NOTICE_SUBJECT = 'New subscriber on {{listName}}';
export const DEFAULT_CREATOR_NOTICE_HTML = `<p>A new member just confirmed their subscription to <strong>{{listName}}</strong>:</p>
<ul>
  <li>Name: {{memberName}}</li>
  <li>Email: {{memberEmail}}</li>
</ul>`;

export const DEFAULT_UNSUBSCRIBED_PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;margin:0;padding:40px 16px;color:#222}.card{max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}</style>
</head><body><div class="card"><h1>You have been unsubscribed</h1><p>You will no longer receive messages from {{listName}}.</p></div></body></html>`;

export interface KindDefaults {
  subject: string | null;
  content: string;
}

export function getDefaultsFor(kind: SubscribeTemplateKind): KindDefaults {
  switch (kind) {
    case 'SUBSCRIBE_PAGE':
      return { subject: null, content: DEFAULT_SUBSCRIBE_PAGE_HTML };
    case 'CONFIRM_EMAIL':
      return { subject: DEFAULT_CONFIRM_EMAIL_SUBJECT, content: DEFAULT_CONFIRM_EMAIL_HTML };
    case 'WELCOME_EMAIL':
      return { subject: DEFAULT_WELCOME_EMAIL_SUBJECT, content: DEFAULT_WELCOME_EMAIL_HTML };
    case 'CREATOR_NOTICE':
      return { subject: DEFAULT_CREATOR_NOTICE_SUBJECT, content: DEFAULT_CREATOR_NOTICE_HTML };
  }
}
