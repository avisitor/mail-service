/*
  Warnings:

  - You are about to alter the column `name` on the `App` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.
  - You are about to alter the column `clientId` on the `App` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.
  - You are about to alter the column `providerId` on the `Message` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.
  - You are about to alter the column `email` on the `Recipient` table. The data in that column could be lost. The data in that column will be cast from `VarChar(320)` to `VarChar(191)`.
  - You are about to alter the column `name` on the `Recipient` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.
  - You are about to alter the column `email` on the `Suppression` table. The data in that column could be lost. The data in that column will be cast from `VarChar(320)` to `VarChar(191)`.
  - You are about to alter the column `name` on the `Template` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.
  - You are about to alter the column `name` on the `Tenant` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.

*/
-- DropForeignKey
ALTER TABLE `App` DROP FOREIGN KEY `fk_app_tenant`;

-- DropForeignKey
ALTER TABLE `Event` DROP FOREIGN KEY `fk_event_group`;

-- DropForeignKey
ALTER TABLE `Event` DROP FOREIGN KEY `fk_event_recipient`;

-- DropForeignKey
ALTER TABLE `Message` DROP FOREIGN KEY `fk_message_recipient`;

-- DropForeignKey
ALTER TABLE `MessageGroup` DROP FOREIGN KEY `fk_group_app`;

-- DropForeignKey
ALTER TABLE `MessageGroup` DROP FOREIGN KEY `fk_group_template`;

-- DropForeignKey
ALTER TABLE `MessageGroup` DROP FOREIGN KEY `fk_group_tenant`;

-- DropForeignKey
ALTER TABLE `Recipient` DROP FOREIGN KEY `fk_recipient_group`;

-- DropForeignKey
ALTER TABLE `Suppression` DROP FOREIGN KEY `fk_suppression_tenant`;

-- DropForeignKey
ALTER TABLE `Template` DROP FOREIGN KEY `fk_template_tenant`;

-- AlterTable
ALTER TABLE `App` MODIFY `name` VARCHAR(191) NOT NULL,
    MODIFY `clientId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Event` MODIFY `type` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Message` MODIFY `providerId` VARCHAR(191) NULL,
    MODIFY `lastError` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MessageGroup` MODIFY `subject` VARCHAR(191) NOT NULL,
    MODIFY `bodyOverrideHtml` VARCHAR(191) NULL,
    MODIFY `bodyOverrideText` VARCHAR(191) NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE `Recipient` MODIFY `email` VARCHAR(191) NOT NULL,
    MODIFY `name` VARCHAR(191) NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    MODIFY `lastError` VARCHAR(191) NULL,
    MODIFY `renderedSubject` VARCHAR(191) NULL,
    MODIFY `renderedHtml` VARCHAR(191) NULL,
    MODIFY `renderedText` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Suppression` MODIFY `email` VARCHAR(191) NOT NULL,
    MODIFY `reason` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Template` MODIFY `name` VARCHAR(191) NOT NULL,
    MODIFY `subject` VARCHAR(191) NOT NULL,
    MODIFY `bodyHtml` VARCHAR(191) NOT NULL,
    MODIFY `bodyText` VARCHAR(191) NULL,
    ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Tenant` MODIFY `name` VARCHAR(191) NOT NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE `SmtpConfig` (
    `id` VARCHAR(191) NOT NULL,
    `scope` ENUM('GLOBAL', 'TENANT', 'APP') NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `appId` VARCHAR(191) NULL,
    `host` VARCHAR(191) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 587,
    `secure` BOOLEAN NOT NULL DEFAULT false,
    `user` VARCHAR(191) NULL,
    `pass` VARCHAR(191) NULL,
    `fromAddress` VARCHAR(191) NULL,
    `fromName` VARCHAR(191) NULL,
    `service` VARCHAR(191) NOT NULL DEFAULT 'smtp',
    `awsRegion` VARCHAR(191) NULL,
    `awsAccessKey` VARCHAR(191) NULL,
    `awsSecretKey` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `SmtpConfig_scope_tenantId_appId_idx`(`scope`, `tenantId`, `appId`),
    UNIQUE INDEX `SmtpConfig_scope_tenantId_appId_key`(`scope`, `tenantId`, `appId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `App` ADD CONSTRAINT `App_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageGroup` ADD CONSTRAINT `MessageGroup_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageGroup` ADD CONSTRAINT `MessageGroup_appId_fkey` FOREIGN KEY (`appId`) REFERENCES `App`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageGroup` ADD CONSTRAINT `MessageGroup_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recipient` ADD CONSTRAINT `Recipient_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `MessageGroup`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `Recipient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `Recipient`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `MessageGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Suppression` ADD CONSTRAINT `Suppression_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmtpConfig` ADD CONSTRAINT `SmtpConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmtpConfig` ADD CONSTRAINT `SmtpConfig_appId_fkey` FOREIGN KEY (`appId`) REFERENCES `App`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RedefineIndex
CREATE UNIQUE INDEX `App_clientId_key` ON `App`(`clientId`);
DROP INDEX `clientId` ON `App`;

-- RedefineIndex
CREATE INDEX `Event_type_idx` ON `Event`(`type`);
DROP INDEX `idx_event_type` ON `Event`;

-- RedefineIndex
CREATE INDEX `Recipient_groupId_status_idx` ON `Recipient`(`groupId`, `status`);
DROP INDEX `idx_recipient_group_status` ON `Recipient`;

-- RedefineIndex
CREATE UNIQUE INDEX `Recipient_groupId_email_key` ON `Recipient`(`groupId`, `email`);
DROP INDEX `uniq_recipient_group_email` ON `Recipient`;

-- RedefineIndex
CREATE INDEX `Suppression_tenantId_email_idx` ON `Suppression`(`tenantId`, `email`);
DROP INDEX `idx_suppression_tenant_email` ON `Suppression`;

-- RedefineIndex
CREATE UNIQUE INDEX `Template_tenantId_name_version_key` ON `Template`(`tenantId`, `name`, `version`);
DROP INDEX `uniq_template_name_version` ON `Template`;
