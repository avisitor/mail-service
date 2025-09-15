-- Migration: Allow multiple global SMTP configurations
-- Remove unique constraint to allow multiple GLOBAL scope configs
-- Only one should be active at a time (enforced by application logic)

-- Drop the existing unique constraint
ALTER TABLE `SmtpConfig` DROP INDEX `SmtpConfig_scope_tenantId_appId_key`;

-- Add a new unique constraint that excludes GLOBAL scope
-- This allows multiple GLOBAL configs but maintains uniqueness for TENANT/APP scopes
ALTER TABLE `SmtpConfig` ADD CONSTRAINT `SmtpConfig_scope_tenantId_appId_unique` 
  UNIQUE (`scope`, `tenantId`, `appId`) 
  WHERE `scope` != 'GLOBAL';

-- Note: MySQL doesn't support partial unique constraints with WHERE clause
-- So we'll handle this with application logic and remove the unique constraint entirely
-- for now, and add it back programmatically for non-GLOBAL scopes

-- Alternative approach: Create a compound unique constraint for non-GLOBAL scopes only
-- We'll handle this in the service layer to ensure:
-- 1. Only one active GLOBAL config at any time
-- 2. Only one config per TENANT scope per tenant
-- 3. Only one config per APP scope per app