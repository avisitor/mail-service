-- CreateTable
CREATE TABLE `MailingList` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `appId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MailingList_appId_idx`(`appId`),
    UNIQUE INDEX `MailingList_appId_name_key`(`appId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MailingListMember` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `listId` INTEGER NOT NULL,
    `name` VARCHAR(64) NOT NULL DEFAULT '',
    `email` VARCHAR(254) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MailingListMember_listId_idx`(`listId`),
    UNIQUE INDEX `MailingListMember_list_email_key`(`listId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MailingList` ADD CONSTRAINT `MailingList_appId_fkey` FOREIGN KEY (`appId`) REFERENCES `App`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MailingListMember` ADD CONSTRAINT `MailingListMember_listId_fkey` FOREIGN KEY (`listId`) REFERENCES `MailingList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
