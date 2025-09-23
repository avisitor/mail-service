# Mail Service

Independent multi-tenant email subsystem (Fastify + TypeScript) providing template rendering, message scheduling, sending, and logging with OAuth2/JWT auth.

## High-Level Features (Phase 1)
- OAuth2 client credentials for app authentication (pluggable provider)
- JWT end-user passthrough (optional) for audit
- Template CRUD + render preview
- Message group (campaign) creation (draft -> scheduled -> processing -> complete)
- Recipient ingestion (simple or contextual JSON)
- Immediate send or future schedule (DB queue)
- Per-recipient personalization via Mustache templates
- Event & log endpoints (basic sent/open)

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js ≥18** - [Download](https://nodejs.org/)
- **MySQL 8.0+** or **MariaDB 10.6+** - [MySQL](https://dev.mysql.com/downloads/) | [MariaDB](https://mariadb.org/download/)
- **Git** - [Download](https://git-scm.com/downloads)
- **npm** or **yarn** package manager (npm comes with Node.js)

### Optional (for full testing):
- **Chrome/Chromium browser** - Required for end-to-end tests with Puppeteer
- **Docker** - For containerized database setup (alternative to local MySQL)

## Stack
- Node.js (>=18), TypeScript
- Fastify for HTTP
- Prisma (MySQL) or Knex (choose via ENV); default SQL schema provided
- Nodemailer provider abstraction (swap for SES/SMTP later)

## Directory Layout
```
src/
  app.ts              # Fastify bootstrap
  server.ts           # CLI entrypoint
  config/             # Configuration loading & validation
  auth/               # OAuth2/JWT middlewares & types
  db/                 # Prisma or query builder init
  modules/
    templates/
    groups/
    recipients/
    messages/
    events/
    suppression/
  plugins/            # Fastify plugins (logging, security headers)
  queue/              # Scheduling & worker loop
  rendering/          # Mustache renderer + variable extraction
  utils/              # Shared helpers
 prisma/               # Prisma schema (if using Prisma)
 migrations/          # SQL migrations (if using raw SQL)
 scripts/             # One-off maintenance scripts
 test/                # Unit/integration tests
 docs/                # Architecture & API docs
```

## Quick Start

### 1. Clone and Install Dependencies
```bash
git clone <repository-url>
cd mail-service
npm install
```

### 2. Database Setup
Create a MySQL database for the mail service:
```sql
CREATE DATABASE mailservice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mailservice'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON mailservice.* TO 'mailservice'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Environment Configuration
Copy the example environment file and update it with your settings:
```bash
cp .env.example .env
```

Edit `.env` and update at minimum:
```bash
# Database connection
DATABASE_URL="mysql://mailservice:your_secure_password@localhost:3306/mailservice"

# SMTP settings (for email sending)
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM_DEFAULT="noreply@yourdomain.com"
```

### 4. Database Migration and Setup
Generate Prisma client and run migrations:
```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

### 5. Start Development Server
```bash
npm run dev
```

The service will be available at `http://localhost:3100`

### 6. Test the Service
Send a test email (requires auth setup - see below for no-auth testing):
```bash
curl -X POST http://localhost:3100/test-email \
  -H 'content-type: application/json' \
  -d '{"to":"you@example.com","subject":"Hello","text":"Testing"}'
```

### Quick Development Start (No Auth)

For development and testing without authentication setup:

```bash
./scripts/dev-noauth.sh
```

This starts the service with:
- Authentication disabled
- In-memory database  
- SMTP dry-run mode (emails logged but not sent)

**Note**: Set `SMTP_DRY_RUN=false` and configure real SMTP credentials in `.env` for actual email delivery.

## Local Auth & JWKS Setup

For role-based UI / API testing without an external IdP you can generate a local JWKS and mint tokens.

1. Generate JWKS & update .env:
```bash
npm run setup:local-auth
```
This creates `jwks.json` and a `private-<kid>.pem` plus updates `.env` with AUTH_ISSUER/AUDIENCE/JWKS_URI.

2. (Optional) Serve jwks.json: ensure your Fastify server (or a simple static server) serves the project root so `http://localhost:3100/jwks.json` is reachable.

3. Mint a token:
```bash
npm run token -- --roles superadmin --sub admin1
```
Add tenant / app scoping:
```bash
npm run token -- --roles tenant_admin,editor --tenant tenantA --app app1
```

4. Use the token in requests:
```bash
curl -H "authorization: Bearer $(npm run -s token -- --roles superadmin)" http://localhost:3100/tenants
```

The role claim defaults to `roles`, tenant to `tenantId`, app to `appId` (configurable via env). Tokens are RS256 signed using the generated key and validated through the JWKS endpoint.

### Browser SSO Redirect Contract

To integrate with an external IDP, the UI and IDP follow a strict, simple contract:

- When the UI has no token, it redirects the browser to `AUTH_IDP_LOGIN_URL` with a single query parameter named `return` containing the absolute URL to the UI home (e.g., `https://host:3100/ui/`).
- After successful login, the IDP must redirect the browser back to the provided `return` URL with a single query parameter named `token` that contains the JWT (RS256 signed and compatible with AUTH_ISSUER/AUTH_AUDIENCE).

Examples:

- UI → IDP:
  `https://idp.example.org/auth?return=https%3A%2F%2Fhost%3A3100%2Fui%2F`

- IDP → UI (on success):
  `https://host:3100/ui/?token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVC...`

Notes:
- The app serves `/ui/config.js` with a dynamic `returnUrl` based on the incoming request, honoring X-Forwarded-* headers when behind a proxy.
- Only `return` and `token` are used. Do not use alternative parameter names or hash fragments.

Troubleshooting auth:
- Set `DEBUG_AUTH=true` in `.env` to get server logs when JWT verification fails (no token, invalid audience/issuer, bad signature, expired, etc.).
- Open DevTools Console to see `[ui-auth]` logs from the browser during the redirect/token parsing phase.

## Secure App Authentication

The mail service now supports secure app-to-app authentication using client secrets and JWT tokens. This replaces the insecure development mode for production deployments.

### Overview

Apps authenticate using:
1. **App ID** (or Client ID) - identifies the application
2. **Client Secret** - secure credential for verification
3. **JWT Token** - time-limited access token (15 minutes)

### Setting Up Secure Authentication

#### Step 1: Generate Client Secret for Your App

First, ensure your app exists in the database. Then generate a client secret:

```bash
# List all apps to find your app ID
node generate-app-secret.mjs --list-apps

# Generate secret for your app (replace with actual app ID)
node generate-app-secret.mjs your-app-id-here
```

**Important**: Save the generated client secret securely - it will not be shown again!

#### Step 2: Configure Your Application

Store the client secret in your application's environment variables:

```bash
# In your app's .env file
CLIENT_SECRET=your-generated-secret-here
APP_CLIENT_ID=your-client-id-here
MAIL_SERVICE_URL=https://your-mail-service-url
```

#### Step 3: Implement Token Authentication

Your application needs to:

1. **Get a token** before making API calls
2. **Use the token** in subsequent requests
3. **Handle token expiration** (refresh as needed)

##### Example Implementation (Node.js)

```javascript
class MailServiceClient {
  constructor(config) {
    this.baseUrl = config.mailServiceUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.token = null;
    this.tokenExpiry = null;
  }

  async getToken() {
    // Check if current token is still valid
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    // Request new token
    const response = await fetch(`${this.baseUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: this.clientId,
        clientSecret: this.clientSecret,
        type: 'application'
      })
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data = await response.json();
    this.token = data.token;
    // Set expiry with 1-minute buffer
    this.tokenExpiry = Date.now() + ((data.expiresIn - 60) * 1000);
    
    return this.token;
  }

  async sendEmail(emailData) {
    const token = await this.getToken();
    
    const response = await fetch(`${this.baseUrl}/send-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(emailData)
    });

    if (response.status === 401) {
      // Token expired, retry once with fresh token
      this.token = null;
      const newToken = await this.getToken();
      
      return fetch(`${this.baseUrl}/send-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${newToken}`
        },
        body: JSON.stringify(emailData)
      });
    }

    return response;
  }
}

// Usage
const mailClient = new MailServiceClient({
  mailServiceUrl: process.env.MAIL_SERVICE_URL,
  clientId: process.env.APP_CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET
});

await mailClient.sendEmail({
  appId: 'your-app-id',
  templateId: 'welcome-email',
  recipients: [
    { 
      email: 'user@example.com', 
      name: 'John Doe',
      context: { userName: 'John' }
    }
  ]
});
```

##### Example Implementation (Python)

```python
import requests
import time
from datetime import datetime, timedelta

class MailServiceClient:
    def __init__(self, base_url, client_id, client_secret):
        self.base_url = base_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.token = None
        self.token_expiry = None

    def get_token(self):
        # Check if current token is still valid
        if self.token and self.token_expiry and datetime.now() < self.token_expiry:
            return self.token

        # Request new token
        response = requests.post(f"{self.base_url}/api/token", json={
            "appId": self.client_id,
            "clientSecret": self.client_secret,
            "type": "application"
        })
        
        if response.status_code != 200:
            raise Exception(f"Authentication failed: {response.status_code}")

        data = response.json()
        self.token = data["token"]
        # Set expiry with 1-minute buffer
        self.token_expiry = datetime.now() + timedelta(seconds=data["expiresIn"] - 60)
        
        return self.token

    def send_email(self, email_data):
        token = self.get_token()
        
        response = requests.post(f"{self.base_url}/send-now", 
            json=email_data,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code == 401:
            # Token expired, retry with fresh token
            self.token = None
            token = self.get_token()
            response = requests.post(f"{self.base_url}/send-now", 
                json=email_data,
                headers={"Authorization": f"Bearer {token}"}
            )
        
        return response

# Usage
import os

mail_client = MailServiceClient(
    os.environ['MAIL_SERVICE_URL'],
    os.environ['APP_CLIENT_ID'],
    os.environ['CLIENT_SECRET']
)

response = mail_client.send_email({
    'appId': 'your-app-id',
    'templateId': 'welcome-email',
    'recipients': [
        {
            'email': 'user@example.com',
            'name': 'John Doe',
            'context': {'userName': 'John'}
        }
    ]
})

if response.status_code == 200:
    print("Email sent successfully")
else:
    print(f"Failed to send email: {response.status_code}")
    print(response.text)
```

##### Example Implementation (PHP)

```php
<?php

class MailServiceClient {
    private $baseUrl;
    private $clientId;
    private $clientSecret;
    private $token;
    private $tokenExpiry;

    public function __construct($baseUrl, $clientId, $clientSecret) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
        $this->token = null;
        $this->tokenExpiry = null;
    }

    public function getToken() {
        // Check if current token is still valid
        if ($this->token && $this->tokenExpiry && time() < $this->tokenExpiry) {
            return $this->token;
        }

        // Request new token
        $data = [
            'appId' => $this->clientId,
            'clientSecret' => $this->clientSecret,
            'type' => 'application'
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->baseUrl . '/api/token',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json'
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (curl_error($ch)) {
            throw new Exception('cURL error: ' . curl_error($ch));
        }
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Authentication failed: HTTP $httpCode");
        }

        $responseData = json_decode($response, true);
        if (!$responseData) {
            throw new Exception('Invalid JSON response from token endpoint');
        }

        $this->token = $responseData['token'];
        // Set expiry with 1-minute buffer
        $this->tokenExpiry = time() + ($responseData['expiresIn'] - 60);
        
        return $this->token;
    }

    public function sendEmail($emailData) {
        $token = $this->getToken();
        
        return $this->makeApiRequest('/send-now', $emailData, $token);
    }

    private function makeApiRequest($endpoint, $data, $token, $retry = true) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->baseUrl . $endpoint,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: Bearer ' . $token
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (curl_error($ch)) {
            curl_close($ch);
            throw new Exception('cURL error: ' . curl_error($ch));
        }
        curl_close($ch);

        // Handle token expiration
        if ($httpCode === 401 && $retry) {
            // Token expired, retry once with fresh token
            $this->token = null;
            $newToken = $this->getToken();
            return $this->makeApiRequest($endpoint, $data, $newToken, false);
        }

        return [
            'statusCode' => $httpCode,
            'body' => $response,
            'data' => json_decode($response, true)
        ];
    }
}

// Usage
$mailClient = new MailServiceClient(
    $_ENV['MAIL_SERVICE_URL'],
    $_ENV['APP_CLIENT_ID'], 
    $_ENV['CLIENT_SECRET']
);

$response = $mailClient->sendEmail([
    'appId' => 'your-app-id',
    'templateId' => 'welcome-email',
    'recipients' => [
        [
            'email' => 'user@example.com', 
            'name' => 'John Doe',
            'context' => ['userName' => 'John']
        ]
    ]
]);

if ($response['statusCode'] === 200) {
    echo "Email sent successfully\n";
} else {
    echo "Failed to send email: " . $response['statusCode'] . "\n";
    echo $response['body'] . "\n";
}
```

### API Reference: POST /send-now

The `/send-now` endpoint accepts flexible payload structures for immediate email sending.

#### Request Structure

**Required Fields:**
- `appId` - Your application ID or client ID
- `recipients` - Array of recipient objects

**Content Options (choose one):**
- Option 1: `templateId` - Use a stored template
- Option 2: `subject` + `html` - Provide content directly  
- Option 3: `templateId` + `subject`/`html` - Use template with overrides

**Optional Fields:**
- `text` - Plain text version of email
- `scheduleAt` - ISO string for scheduled sending

#### Recipient Object Structure

Each recipient can contain:
- `email` (required) - Recipient email address
- `name` (optional) - Recipient display name
- `context` (optional) - Object containing template variables
- Any additional fields - These become available as template variables

#### Example Requests

**Using Template ID:**
```json
{
  "appId": "your-app-id",
  "templateId": "welcome-email",
  "recipients": [
    {
      "email": "user@example.com",
      "name": "John Doe",
      "context": {
        "userName": "John",
        "companyName": "Acme Corp"
      }
    }
  ]
}
```

**Using Direct Content:**
```json
{
  "appId": "your-app-id",
  "subject": "Welcome {{name}}!",
  "html": "<p>Hello {{name}} from {{company}}!</p>",
  "recipients": [
    {
      "email": "user@example.com",
      "name": "John Doe",
      "company": "Acme Corp"
    }
  ]
}
```

**Scheduled Email:**
```json
{
  "appId": "your-app-id",
  "templateId": "newsletter",
  "recipients": [{"email": "user@example.com"}],
  "scheduleAt": "2024-01-15T10:00:00Z"
}
```

#### Response

**Success (200):**
```json
{
  "groupId": "grp_abc123",
  "scheduled": false,
  "jobCount": 1,
  "jobIds": ["job_xyz789"],
  "scheduledAt": null
}
```

**Error (400/401/500):**
```json
{
  "error": "BadRequest",
  "message": "appId, (subject or templateId), recipients required"
}
```

## Scheduled Email Delivery

The mail service supports scheduling emails for future delivery using the `scheduleAt` parameter.

### Scheduling Parameters

**`scheduleAt`** - ISO 8601 timestamp for when the email should be sent
- Must be a future date and time
- Format: `YYYY-MM-DDTHH:mm:ss.sssZ`
- Example: `"2024-12-25T09:00:00.000Z"`

### Scheduled Email Examples

**Node.js:**
```javascript
const scheduleTime = new Date();
scheduleTime.setHours(scheduleTime.getHours() + 2); // 2 hours from now

await client.sendEmail({
  appId: 'your-app-id',
  subject: 'Scheduled Newsletter',
  html: '<p>This email was scheduled in advance!</p>',
  recipients: [{ email: 'user@example.com' }],
  scheduleAt: scheduleTime.toISOString()
});
```

**Python:**
```python
from datetime import datetime, timedelta
import pytz

# Schedule for tomorrow at 10 AM UTC
schedule_time = datetime.now(pytz.UTC) + timedelta(days=1)
schedule_time = schedule_time.replace(hour=10, minute=0, second=0, microsecond=0)

client.send_email({
    'appId': 'your-app-id',
    'subject': 'Daily Report',
    'html': '<p>Your daily report is ready!</p>',
    'recipients': [{'email': 'manager@company.com'}],
    'scheduleAt': schedule_time.isoformat()
})
```

**PHP:**
```php
// Schedule for next Monday at 9 AM
$scheduleTime = new DateTime('next Monday 09:00:00', new DateTimeZone('UTC'));

$client->sendEmail([
    'appId' => 'your-app-id',
    'subject' => 'Weekly Update',
    'html' => '<p>Here is your weekly update!</p>',
    'recipients' => [['email' => 'team@company.com']],
    'scheduleAt' => $scheduleTime->format('c')
]);
```

### Scheduled Email Response

When an email is scheduled, the response includes scheduling information:

```json
{
  "groupId": "grp_abc123",
  "scheduled": true,
  "jobCount": 1,
  "jobIds": ["job_xyz789"],
  "scheduledAt": "2024-12-25T09:00:00.000Z"
}
```

## Batch Processing & Rate Limiting

The mail service includes configurable batch processing to handle large email campaigns while respecting rate limits and avoiding spam filter triggers.

### Configuration Options

Control batching behavior using environment variables:

```bash
# Batch Processing
MAIL_BATCH_SIZE=10                    # Emails processed simultaneously (default: 10)
MAIL_INTER_BATCH_DELAY_MS=0          # Delay between batches in milliseconds (default: 0)

# Rate Limiting  
MAIL_MAX_EMAILS_PER_HOUR=1000        # Maximum emails per hour (optional)
MAIL_MAX_EMAILS_PER_DAY=10000        # Maximum emails per day (optional)
```

### Anti-Spam Configuration Examples

**High-Volume Newsletter (Spread Delivery):**
```bash
MAIL_BATCH_SIZE=50                    # Process 50 emails at once
MAIL_INTER_BATCH_DELAY_MS=60000      # Wait 1 minute between batches
MAIL_MAX_EMAILS_PER_HOUR=500         # Limit to 500 emails per hour
```

**Transactional Email (Fast Delivery):**
```bash
MAIL_BATCH_SIZE=20                    # Small batches for quick processing
MAIL_INTER_BATCH_DELAY_MS=0          # No delay between batches
MAIL_MAX_EMAILS_PER_HOUR=2000        # Higher hourly limit
```

**Compliance-Heavy Environment:**
```bash
MAIL_BATCH_SIZE=25                    # Conservative batch size
MAIL_INTER_BATCH_DELAY_MS=120000     # 2-minute delays between batches
MAIL_MAX_EMAILS_PER_HOUR=100         # Very restrictive hourly limit
MAIL_MAX_EMAILS_PER_DAY=1000         # Daily quota compliance
```

### How Batching Works

1. **Large Recipient Lists**: When you send to many recipients, emails are automatically split into batches
2. **Inter-Batch Delays**: Configurable delays prevent overwhelming SMTP servers and reduce spam filter triggers
3. **Rate Limiting**: Global hourly and daily limits prevent exceeding provider quotas
4. **Automatic Throttling**: The system automatically slows down when approaching rate limits

### Monitoring Batch Processing

The worker system logs detailed information about batch processing:

```
[Worker] Starting tick with config: {
  batchSize: 50,
  interBatchDelayMs: 60000,
  maxEmailsPerHour: 500,
  limitJobs: 250
}
[Worker] Processing 150 jobs in batches of 50
[Worker] Processing batch 1 with 50 jobs
[Worker] Waiting 60000ms before next batch...
[Worker] Processing batch 2 with 50 jobs
[Worker] Completed tick: 150 processed, 145 sent, 5 failed, 0 rate limited
```

### Email Composition Examples

The following examples demonstrate how to send different types of emails using the `/send-now` endpoint in each programming language.

#### Node.js Email Composition Examples

```javascript
// Example 1: Welcome email with template
await mailClient.sendEmail({
  appId: 'your-app-id',
  templateId: 'welcome-template',
  recipients: [
    {
      email: 'newuser@example.com',
      name: 'New User',
      context: {
        userName: 'New User',
        activationLink: 'https://yourapp.com/activate/abc123',
        supportEmail: 'support@yourapp.com'
      }
    }
  ]
});

// Example 2: Password reset email
await mailClient.sendEmail({
  appId: 'your-app-id',
  subject: 'Password Reset Request',
  html: `
    <h2>Password Reset</h2>
    <p>Hello {{name}},</p>
    <p>You requested a password reset. Click the link below to reset your password:</p>
    <a href="{{resetLink}}" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a>
    <p>This link expires in 24 hours.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `,
  recipients: [
    {
      email: 'user@example.com',
      name: 'John Doe',
      context: {
        name: 'John',
        resetLink: 'https://yourapp.com/reset-password?token=xyz789'
      }
    }
  ]
});

// Example 3: Bulk newsletter
const subscribers = [
  { email: 'user1@example.com', name: 'Alice', preferences: 'tech' },
  { email: 'user2@example.com', name: 'Bob', preferences: 'business' },
  { email: 'user3@example.com', name: 'Carol', preferences: 'design' }
];

await mailClient.sendEmail({
  appId: 'your-app-id',
  templateId: 'newsletter-template',
  recipients: subscribers.map(user => ({
    email: user.email,
    name: user.name,
    context: {
      userName: user.name,
      preferences: user.preferences,
      unsubscribeLink: `https://yourapp.com/unsubscribe/${user.email}`
    }
  }))
});
```

#### Python Email Composition Examples

```python
# Example 1: Order confirmation email
response = mail_client.send_email({
    'appId': 'your-app-id',
    'subject': 'Order Confirmation #{{orderNumber}}',
    'html': '''
        <h2>Thank you for your order!</h2>
        <p>Hi {{customerName}},</p>
        <p>Your order #{{orderNumber}} has been confirmed.</p>
        <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0;">
            <h3>Order Details:</h3>
            <p><strong>Items:</strong> {{itemCount}} items</p>
            <p><strong>Total:</strong> ${{total}}</p>
            <p><strong>Shipping:</strong> {{shippingAddress}}</p>
        </div>
        <p>Track your order: <a href="{{trackingLink}}">{{trackingNumber}}</a></p>
    ''',
    'recipients': [
        {
            'email': 'customer@example.com',
            'name': 'Jane Customer',
            'context': {
                'customerName': 'Jane',
                'orderNumber': 'ORD-001234',
                'itemCount': 3,
                'total': '99.99',
                'shippingAddress': '123 Main St, City, ST 12345',
                'trackingLink': 'https://shipping.com/track/ABC123',
                'trackingNumber': 'ABC123'
            }
        }
    ]
})

# Example 2: Event invitation
import datetime

event_date = datetime.datetime.now() + datetime.timedelta(days=7)

response = mail_client.send_email({
    'appId': 'your-app-id',
    'templateId': 'event-invitation',
    'recipients': [
        {
            'email': 'attendee@example.com',
            'name': 'Potential Attendee',
            'context': {
                'attendeeName': 'John',
                'eventName': 'Annual Tech Conference',
                'eventDate': event_date.strftime('%B %d, %Y'),
                'eventTime': '9:00 AM - 5:00 PM',
                'venue': 'Convention Center, Downtown',
                'rsvpLink': 'https://events.com/rsvp/tech-conf-2024'
            }
        }
    ]
})

# Example 3: Scheduled reminder email
reminder_time = datetime.datetime.now() + datetime.timedelta(hours=2)

response = mail_client.send_email({
    'appId': 'your-app-id',
    'subject': 'Reminder: {{eventName}} starts in 2 hours',
    'html': '''
        <h2>Don't forget!</h2>
        <p>Hi {{userName}},</p>
        <p>Your {{eventName}} starts in 2 hours at {{eventTime}}.</p>
        <p><strong>Location:</strong> {{location}}</p>
        <p><a href="{{joinLink}}">Join Meeting</a></p>
    ''',
    'scheduleAt': reminder_time.isoformat(),
    'recipients': [
        {
            'email': 'participant@example.com',
            'name': 'Meeting Participant',
            'context': {
                'userName': 'Alex',
                'eventName': 'Project Kickoff Meeting',
                'eventTime': '2:00 PM EST',
                'location': 'Conference Room A',
                'joinLink': 'https://meet.example.com/project-kickoff'
            }
        }
    ]
})
```

#### PHP Email Composition Examples

```php
<?php

// Example 1: Account verification email
$response = $mailClient->sendEmail([
    'appId' => 'your-app-id',
    'subject' => 'Please verify your email address',
    'html' => '
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
            <h2>Welcome to Our Service!</h2>
            <p>Hello {{userName}},</p>
            <p>Thank you for signing up! Please verify your email address to complete your registration.</p>
            <div style="text-align: center; margin: 20px 0;">
                <a href="{{verificationLink}}" 
                   style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                   Verify Email Address
                </a>
            </div>
            <p>This verification link expires in 24 hours.</p>
            <p>If you didn\'t create an account, please ignore this email.</p>
        </div>
    ',
    'recipients' => [
        [
            'email' => 'newuser@example.com',
            'name' => 'New User',
            'context' => [
                'userName' => 'John',
                'verificationLink' => 'https://yourapp.com/verify?token=abc123def456'
            ]
        ]
    ]
]);

// Example 2: Invoice email with PDF attachment concept
$response = $mailClient->sendEmail([
    'appId' => 'your-app-id',
    'templateId' => 'invoice-template',
    'recipients' => [
        [
            'email' => 'billing@client.com',
            'name' => 'Client Billing Department',
            'context' => [
                'clientName' => 'Acme Corporation',
                'invoiceNumber' => 'INV-2024-001',
                'invoiceDate' => date('F j, Y'),
                'dueDate' => date('F j, Y', strtotime('+30 days')),
                'subtotal' => '$1,500.00',
                'tax' => '$150.00',
                'total' => '$1,650.00',
                'paymentLink' => 'https://billing.yourcompany.com/pay/INV-2024-001'
            ]
        ]
    ]
]);

// Example 3: Multi-recipient promotion email
$customers = [
    ['email' => 'vip@example.com', 'name' => 'VIP Customer', 'tier' => 'VIP', 'discount' => 25],
    ['email' => 'premium@example.com', 'name' => 'Premium Customer', 'tier' => 'Premium', 'discount' => 15],
    ['email' => 'standard@example.com', 'name' => 'Standard Customer', 'tier' => 'Standard', 'discount' => 10]
];

$recipients = array_map(function($customer) {
    return [
        'email' => $customer['email'],
        'name' => $customer['name'],
        'context' => [
            'customerName' => explode('@', $customer['email'])[0],
            'customerTier' => $customer['tier'],
            'discountPercent' => $customer['discount'],
            'promoCode' => strtoupper($customer['tier']) . $customer['discount'],
            'expiryDate' => date('F j, Y', strtotime('+7 days'))
        ]
    ];
}, $customers);

$response = $mailClient->sendEmail([
    'appId' => 'your-app-id',
    'subject' => 'Exclusive {{discountPercent}}% Off - {{customerTier}} Member Special!',
    'html' => '
        <div style="max-width: 600px; margin: 0 auto;">
            <h1>Special Offer for {{customerTier}} Members!</h1>
            <p>Hi {{customerName}},</p>
            <p>As a valued {{customerTier}} member, you get an exclusive {{discountPercent}}% discount!</p>
            <div style="background: #f8f9fa; padding: 20px; text-align: center; margin: 20px 0;">
                <h2>Promo Code: {{promoCode}}</h2>
                <p>Valid until {{expiryDate}}</p>
            </div>
            <a href="https://shop.example.com?promo={{promoCode}}" 
               style="background: #007cba; color: white; padding: 12px 24px; text-decoration: none;">
               Shop Now
            </a>
        </div>
    ',
    'recipients' => $recipients
]);

if ($response['statusCode'] === 200) {
    echo "Promotion emails sent to " . count($recipients) . " customers\n";
    echo "Group ID: " . $response['data']['groupId'] . "\n";
} else {
    echo "Failed to send promotion emails: " . $response['statusCode'] . "\n";
}
?>
```

#### Step 4: Environment Configuration

##### Production Mode (Default)
```bash
# In mail-service .env
ALLOW_INSECURE_APP_TOKENS=false
NODE_ENV=production
```

##### Development Mode (Testing Only)
```bash
# In mail-service .env - NEVER use in production!
ALLOW_INSECURE_APP_TOKENS=true
NODE_ENV=development
```

### Security Best Practices

1. **Never commit client secrets** to version control
2. **Store secrets securely** (environment variables, secure vaults)
3. **Rotate secrets regularly** using the CLI tool
4. **Use HTTPS** for all API calls in production
5. **Monitor authentication logs** for suspicious activity
6. **Set appropriate token refresh intervals** (tokens expire after 15 minutes)

### Troubleshooting

#### Common Issues

**401 Unauthorized Errors:**
- Check that `ALLOW_INSECURE_APP_TOKENS=false` in production
- Verify client secret is correct
- Ensure app exists in database
- Check that app has a configured client secret

**Token Expiration:**
- Implement automatic token refresh in your client
- Don't cache tokens beyond their expiry time
- Handle 401 responses by getting a new token

**Client Secret Management:**
```bash
# List all apps and their security status
node generate-app-secret.mjs --list-apps

# Generate new secret (invalidates old one)
node generate-app-secret.mjs your-app-id

# Check app authentication status via API
curl -X POST https://your-mail-service/api/token \
  -H "Content-Type: application/json" \
  -d '{"appId":"your-app-id","clientSecret":"test","type":"application"}'
```

### API Reference

#### POST /api/token

Request new authentication token.

**Request:**
```json
{
  "appId": "your-app-id-or-client-id",
  "clientSecret": "your-client-secret",
  "type": "application"
}
```

**Response (Success):**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "developmentMode": false
}
```

**Response (Error):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid client credentials"
}
```

## Testing

The mail service includes comprehensive test coverage:

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run specific test categories
npm test test/frontend-*.test.ts  # Frontend tests only
npm test tests/sms-*.test.ts      # SMS tests only
```

### Test Categories
- **Frontend Tests (63 tests)**: Role-based UI, navigation, app integration, E2E browser testing
- **SMS Tests (20 tests)**: Configuration management, encryption, CRUD operations  
- **Backend Tests (245+ tests)**: Authentication, email, templates, APIs, security

### Prerequisites for Full Testing
- **Chrome/Chromium browser**: Required for Puppeteer E2E tests
- **MySQL database**: Required for integration tests (uses same DB as development)

**Note**: E2E tests use Puppeteer which will automatically download Chromium if not found. The first test run may take longer as it downloads the browser.

## Environment Variables

See `.env.example` for all available configuration options. Key variables include:

### Required for Basic Operation
```bash
DATABASE_URL="mysql://user:password@host:port/database"
SMTP_HOST=your-smtp-server.com
SMTP_FROM_DEFAULT="noreply@yourdomain.com"
```

### Optional Configuration
```bash
# Server settings
PORT=3100
HOST=0.0.0.0
NODE_ENV=development

# Authentication (for production)
AUTH_ISSUER=https://your-idp.com
AUTH_AUDIENCE=mail-service
JWKS_URL=https://your-idp.com/.well-known/jwks.json

# Security
ALLOW_INSECURE_APP_TOKENS=false  # Set to true only for development

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

## Env Variables (.env.example)
See `.env.example` for all settings (DB, OAuth2 issuer, JWKS, etc.).

## Common Setup Issues

### Database Connection Issues
```bash
# Error: "Access denied for user"
# Solution: Ensure database user has proper permissions
GRANT ALL PRIVILEGES ON mailservice.* TO 'mailservice'@'localhost';

# Error: "Unknown database 'mailservice'"  
# Solution: Create the database first
CREATE DATABASE mailservice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Error: Prisma migration failed
# Solution: Reset and regenerate
npm run prisma:generate
npx prisma migrate reset
npm run prisma:migrate
```

### SMTP/Email Issues
```bash
# Test SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  host: 'your-smtp-host',
  port: 587,
  secure: false,
  auth: { user: 'your-user', pass: 'your-pass' }
});
transporter.verify((err, success) => {
  console.log(err ? 'SMTP Error:' + err : 'SMTP OK');
});
"
```

### Authentication Issues
```bash
# Check if tokens are being generated correctly
npm run token -- --roles superadmin --sub test-user

# Verify JWKS endpoint is accessible
curl http://localhost:3100/jwks.json

# Enable auth debugging
echo "DEBUG_AUTH=true" >> .env
```

### Frontend/UI Issues
```bash
# Clear browser cache and check console for errors
# Verify static files are being served:
curl http://localhost:3100/ui/

# Check frontend build process
npm run validate:html
npm run lint:js
```

## Next Steps
- Flesh out Prisma schema & initial migration
- Implement auth middleware & tenant scoping
- Implement template endpoints
- Implement message group + recipient ingestion
- Add scheduler worker
- Add open tracking pixel route
- Flesh out /test-email to support multiple recipients
- Add suppression list management UI

## License
TBD
