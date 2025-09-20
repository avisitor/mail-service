-- Create SMTP configuration for the Hawaii Organizations tenant
INSERT INTO mailservice.SmtpConfig (
    id,
    scope,
    tenantId,
    appId,
    host,
    port,
    secure,
    user,
    pass,
    fromAddress,
    fromName,
    service,
    isActive,
    createdAt,
    updatedAt
) VALUES (
    'smtp_hawaii_orgs',
    'TENANT',
    'tenant_hawaii_orgs',
    NULL,
    'localhost',
    1025,
    0,
    '',
    '',
    'hawaii@worldspot.com',
    'Hawaii Organizations',
    'smtp',
    1,
    NOW(),
    NOW()
);