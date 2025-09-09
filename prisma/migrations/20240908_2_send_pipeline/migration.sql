ALTER TABLE Recipient
  ADD COLUMN failedAttempts int NOT NULL DEFAULT 0;

ALTER TABLE Message
  ADD COLUMN attemptCount int NOT NULL DEFAULT 1,
  ADD COLUMN lastError text NULL;