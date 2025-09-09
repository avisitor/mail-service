-- Rebased initial migration combining prior init + groups/recipients + send pipeline so fresh DB applies cleanly

CREATE TABLE Tenant (
  id varchar(191) PRIMARY KEY,
  name varchar(255) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE App (
  id varchar(191) PRIMARY KEY,
  tenantId varchar(191) NOT NULL,
  name varchar(255) NOT NULL,
  clientId varchar(255) NOT NULL UNIQUE,
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_app_tenant FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Template (
  id varchar(191) PRIMARY KEY,
  tenantId varchar(191) NOT NULL,
  name varchar(255) NOT NULL,
  version int NOT NULL,
  subject text NOT NULL,
  bodyHtml mediumtext NOT NULL,
  bodyText mediumtext NULL,
  variables json NOT NULL,
  isActive tinyint(1) NOT NULL DEFAULT 1,
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_template_tenant FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_template_name_version (tenantId, name, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE MessageGroup (
  id varchar(191) PRIMARY KEY,
  tenantId varchar(191) NOT NULL,
  appId varchar(191) NOT NULL,
  templateId varchar(191) NULL,
  subject text NOT NULL,
  bodyOverrideHtml mediumtext NULL,
  bodyOverrideText mediumtext NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  scheduledAt datetime(3) NULL,
  startedAt datetime(3) NULL,
  completedAt datetime(3) NULL,
  createdBy varchar(191) NULL,
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  totalRecipients int NOT NULL DEFAULT 0,
  processedRecipients int NOT NULL DEFAULT 0,
  sentCount int NOT NULL DEFAULT 0,
  failedCount int NOT NULL DEFAULT 0,
  canceledAt datetime(3) NULL,
  lockVersion int NOT NULL DEFAULT 0,
  CONSTRAINT fk_group_tenant FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_app FOREIGN KEY (appId) REFERENCES App(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_template FOREIGN KEY (templateId) REFERENCES Template(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Recipient (
  id varchar(191) PRIMARY KEY,
  groupId varchar(191) NOT NULL,
  email varchar(320) NOT NULL,
  name varchar(255) NULL,
  context json NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  lastError text NULL,
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  renderedSubject text NULL,
  renderedHtml mediumtext NULL,
  renderedText mediumtext NULL,
  failedAttempts int NOT NULL DEFAULT 0,
  CONSTRAINT fk_recipient_group FOREIGN KEY (groupId) REFERENCES MessageGroup(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_recipient_group_email (groupId, email),
  KEY idx_recipient_group_status (groupId, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Message (
  id varchar(191) PRIMARY KEY,
  recipientId varchar(191) NOT NULL,
  providerId varchar(255) NULL,
  sentAt datetime(3) NULL,
  openedAt datetime(3) NULL,
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attemptCount int NOT NULL DEFAULT 1,
  lastError text NULL,
  CONSTRAINT fk_message_recipient FOREIGN KEY (recipientId) REFERENCES Recipient(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Event (
  id varchar(191) PRIMARY KEY,
  recipientId varchar(191) NULL,
  groupId varchar(191) NULL,
  type varchar(64) NOT NULL,
  occurredAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  meta json NULL,
  createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_event_recipient FOREIGN KEY (recipientId) REFERENCES Recipient(id) ON DELETE SET NULL,
  CONSTRAINT fk_event_group FOREIGN KEY (groupId) REFERENCES MessageGroup(id) ON DELETE SET NULL,
  KEY idx_event_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE Suppression (
  id varchar(191) PRIMARY KEY,
  tenantId varchar(191) NOT NULL,
  email varchar(320) NOT NULL,
  reason text NULL,
  addedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_suppression_tenant FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
  KEY idx_suppression_tenant_email (tenantId, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
