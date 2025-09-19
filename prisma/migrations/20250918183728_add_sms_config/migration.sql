-- CreateEnum
CREATE TABLE IF NOT EXISTS `_SmsConfigScope_old` SELECT * FROM `_SmsConfigScope` WHERE 1=0;
DROP TABLE IF EXISTS `_SmsConfigScope_old`;

-- CreateTable
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
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(191) NULL,

    INDEX `SmsConfig_scope_tenantId_appId_idx`(`scope`, `tenantId`, `appId`),
    INDEX `SmsConfig_scope_isActive_idx`(`scope`, `isActive`),
    INDEX `SmsConfig_tenantId_fkey`(`tenantId`),
    INDEX `SmsConfig_appId_fkey`(`appId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SmsConfig` ADD CONSTRAINT `SmsConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsConfig` ADD CONSTRAINT `SmsConfig_appId_fkey` FOREIGN KEY (`appId`) REFERENCES `App`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;