-- Create test data for tenants and apps based on test-app.html configurations

-- Create a test tenant
INSERT INTO mailservice.Tenant (
    id,
    name,
    status,
    createdAt
) VALUES (
    'tenant_hawaii_orgs',
    'Hawaii Organizations',
    'active',
    NOW()
);

-- Create the ReTree Hawaii app
INSERT INTO mailservice.App (
    id,
    tenantId,
    name,
    clientId,
    createdAt
) VALUES (
    'cmfka688r0001b77ofpgm57ix',
    'tenant_hawaii_orgs',
    'ReTree Hawaii App',
    'retree-hawaii-client',
    NOW()
);

-- Create the Outings Management app
INSERT INTO mailservice.App (
    id,
    tenantId,
    name,
    clientId,
    createdAt
) VALUES (
    'outings-app-id',
    'tenant_hawaii_orgs',
    'Outings Management',
    'outings-client',
    NOW()
);

-- Create a test invalid app for testing error scenarios
INSERT INTO mailservice.App (
    id,
    tenantId,
    name,
    clientId,
    createdAt
) VALUES (
    'invalid-app-does-not-exist',
    'tenant_hawaii_orgs',
    'Invalid Application',
    'invalid-client',
    NOW()
);