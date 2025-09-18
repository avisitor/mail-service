-- Recreate legitimate production tenants and apps that were accidentally deleted by prisma migrate reset

-- Recreate legitimate tenants based on conversation history
INSERT INTO Tenant (id, name, status, createdAt) VALUES 
('cmfc3o60i001uhzacbm7d8qn9', 'Robs World', 'active', '2025-09-12 00:00:00.000'),
('cmfc89dug0000j6fb1cury7v5', 'ACME Corporation', 'active', '2025-09-12 00:00:00.000'),
('test-tenant-1', 'Test Tenant 1', 'active', '2025-09-12 00:00:00.000'),
('test-tenant-2', 'Test Tenant 2', 'active', '2025-09-12 00:00:00.000'),
('robs-world-tenant', 'Robs World Tenant', 'active', '2025-09-12 00:00:00.000');

-- Recreate legitimate apps for these tenants (based on the expected structure)
-- Note: Using INSERT IGNORE in case some already exist
INSERT IGNORE INTO App (id, tenantId, name, clientId, createdAt) VALUES 
('retreehawaii', 'default', 'ReTree Hawaii', 'retreehawaii-client', NOW()),
('outings', 'default', 'Outings', 'outings-client', NOW()),
('robs-world-app', 'robs-world-tenant', 'Robs World App', 'robs-world-client', '2025-09-12 00:00:00.000'),
('acme-app', 'cmfc89dug0000j6fb1cury7v5', 'ACME App', 'acme-client', '2025-09-12 00:00:00.000');

-- Recreate the SMTP configs that existed before (approximate data based on conversation)
-- Note: These values are estimates - you may need to update with actual values
INSERT IGNORE INTO SmtpConfig (id, scope, tenantId, host, port, secure, user, pass, fromAddress, fromName, service, isActive, createdAt) VALUES 
('smtp_robs_world', 'TENANT', 'robs-world-tenant', 'localhost', 1025, 0, '', '', 'test@robsworld.com', 'Robs World', 'smtp', 1, '2025-09-12 00:00:00.000'),
('smtp_acme', 'TENANT', 'cmfc89dug0000j6fb1cury7v5', 'localhost', 1025, 0, '', '', 'test@acme.com', 'ACME Corporation', 'smtp', 1, '2025-09-12 00:00:00.000'),
('smtp_default', 'TENANT', 'default', 'localhost', 1025, 0, '', '', 'robw@worldspot.com', 'Mail Service', 'smtp', 1, '2025-09-12 00:00:00.000');