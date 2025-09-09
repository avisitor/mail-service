ALTER TABLE MessageGroup
  ADD COLUMN totalRecipients int NOT NULL DEFAULT 0,
  ADD COLUMN processedRecipients int NOT NULL DEFAULT 0,
  ADD COLUMN sentCount int NOT NULL DEFAULT 0,
  ADD COLUMN failedCount int NOT NULL DEFAULT 0,
  ADD COLUMN canceledAt datetime(3) NULL,
  ADD COLUMN lockVersion int NOT NULL DEFAULT 0;

ALTER TABLE Recipient
  ADD COLUMN renderedSubject text NULL,
  ADD COLUMN renderedHtml mediumtext NULL,
  ADD COLUMN renderedText mediumtext NULL;

ALTER TABLE Recipient
  ADD UNIQUE KEY uniq_recipient_group_email (groupId, email);