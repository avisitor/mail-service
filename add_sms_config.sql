-- Create SmsConfigScope enum
CREATE TYPE `SmsConfigScope` AS ENUM ('GLOBAL', 'TENANT', 'APP');

-- Create SmsConfig table
CREATE TABLE `SmsConfig` (
    `id` VARCHAR(191) NOT NULL,
    `scope` ENUM('GLOBAL', 'TENANT', 'APP') NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `appId` VARCHAR(191) NULL,
    `sid` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `fromNumber` VARCHAR(191) NOT NULL,
    `fallbackTo` VARCHAR(191) NULL,
    `serviceSid` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `SmsConfig_scope_tenantId_appId_idx`(`scope`, `tenantId`, `appId`),
    INDEX `SmsConfig_scope_isActive_idx`(`scope`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign key constraints
ALTER TABLE `SmsConfig` ADD CONSTRAINT `SmsConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SmsConfig` ADD CONSTRAINT `SmsConfig_appId_fkey` FOREIGN KEY (`appId`) REFERENCES `App`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;