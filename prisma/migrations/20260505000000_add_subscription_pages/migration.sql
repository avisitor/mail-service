-- AlterTable: extend MailingList with subscription page settings + creator
ALTER TABLE `MailingList`
    ADD COLUMN `createdBy` VARCHAR(128) NULL,
    ADD COLUMN `creatorEmail` VARCHAR(254) NULL,
    ADD COLUMN `subscribePageEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `subscribeSlug` VARCHAR(64) NULL,
    ADD COLUMN `notifyCreatorOnJoin` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: per-app slug uniqueness for subscribe URLs
CREATE UNIQUE INDEX `MailingList_appId_slug_key` ON `MailingList`(`appId`, `subscribeSlug`);

-- AlterTable: extend MailingListMember with confirmation/unsubscribe tracking
ALTER TABLE `MailingListMember`
    ADD COLUMN `unsubscribeToken` VARCHAR(64) NULL,
    ADD COLUMN `confirmedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `MailingListMember_unsubscribeToken_key` ON `MailingListMember`(`unsubscribeToken`);

-- AlterTable: tag templates by kind and optionally bind to a mailing list
ALTER TABLE `Template`
    ADD COLUMN `kind` ENUM('CAMPAIGN','SUBSCRIBE_PAGE','CONFIRM_EMAIL','WELCOME_EMAIL','CREATOR_NOTICE') NOT NULL DEFAULT 'CAMPAIGN',
    ADD COLUMN `mailingListId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Template_appId_kind_idx` ON `Template`(`appId`, `kind`);
CREATE INDEX `Template_listId_kind_idx` ON `Template`(`mailingListId`, `kind`);

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_mailingListId_fkey`
    FOREIGN KEY (`mailingListId`) REFERENCES `MailingList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: pending double-opt-in subscriptions
CREATE TABLE `PendingSubscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listId` INTEGER NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `name` VARCHAR(64) NOT NULL DEFAULT '',
    `token` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PendingSubscription_token_key`(`token`),
    INDEX `PendingSubscription_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `PendingSubscription_list_email_key`(`listId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PendingSubscription` ADD CONSTRAINT `PendingSubscription_listId_fkey`
    FOREIGN KEY (`listId`) REFERENCES `MailingList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
