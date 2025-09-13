-- Migration: Add SMTP Configuration Management
-- Date: 2025-09-11
-- Description: Add hierarchical SMTP configuration system with global, tenant, and app-level configs

-- Create SmtpConfig table
CREATE TABLE SmtpConfig (
    id VARCHAR(255) PRIMARY KEY,
    scope ENUM('GLOBAL', 'TENANT', 'APP') NOT NULL,
    tenantId VARCHAR(255) NULL,
    appId VARCHAR(255) NULL,
    
    -- SMTP settings
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 587,
    secure BOOLEAN NOT NULL DEFAULT FALSE,
    user VARCHAR(255) NULL,
    pass TEXT NULL,  -- encrypted
    fromAddress VARCHAR(255) NULL,
    fromName VARCHAR(255) NULL,
    
    -- Service selection
    service ENUM('smtp', 'ses') NOT NULL DEFAULT 'smtp',
    
    -- SES-specific settings (future use)
    awsRegion VARCHAR(100) NULL,
    awsAccessKey TEXT NULL,  -- encrypted
    awsSecretKey TEXT NULL,  -- encrypted
    
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy VARCHAR(255) NULL,
    
    -- Constraints
    UNIQUE KEY unique_scope_config (scope, tenantId, appId),
    INDEX idx_scope_tenant_app (scope, tenantId, appId),
    
    -- Foreign key constraints
    FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
    FOREIGN KEY (appId) REFERENCES App(id) ON DELETE CASCADE,
    
    -- Check constraints
    CHECK (
        (scope = 'GLOBAL' AND tenantId IS NULL AND appId IS NULL) OR
        (scope = 'TENANT' AND tenantId IS NOT NULL AND appId IS NULL) OR
        (scope = 'APP' AND tenantId IS NOT NULL AND appId IS NOT NULL)
    )
);

-- Insert a default global configuration based on current environment variables
-- This will be the fallback when no specific configuration is found
INSERT INTO SmtpConfig (
    id, 
    scope, 
    host, 
    port, 
    secure, 
    user, 
    pass, 
    fromAddress, 
    fromName, 
    service,
    createdBy
) VALUES (
    'global-default',
    'GLOBAL',
    COALESCE(
        (SELECT value FROM (SELECT 'localhost' as value) as defaults), 
        'localhost'
    ),
    587,
    FALSE,
    NULL,
    NULL,
    NULL,
    'Mail Service',
    'smtp',
    'system-migration'
);

-- Note: The above INSERT uses placeholder values. In a real migration,
-- you would want to read from environment variables or configuration.
-- Since this is a SQL script, actual environment variable substitution
-- would need to be handled by the migration runner.