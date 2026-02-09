-- Migration: Add Smslog table for SMS delivery logging
-- Date: 2026-02-09
-- Description: Ensure Smslog exists so SMS deliveries can be logged and queried.

CREATE TABLE IF NOT EXISTS Smslog (
    id VARCHAR(255) PRIMARY KEY,
    messageId VARCHAR(255) NULL,
    groupId VARCHAR(20) NULL,
    appId VARCHAR(255) NULL,
    sent DATETIME(0) DEFAULT CURRENT_TIMESTAMP,
    senderName VARCHAR(64) NULL,
    senderPhone VARCHAR(32) NULL,
    recipients MEDIUMTEXT NULL,
    message MEDIUMTEXT NULL,
    delivered DATETIME(0) NULL,
    failed DATETIME(0) NULL,
    errorCode VARCHAR(32) NULL,
    errorMessage TEXT NULL,
    createdAt DATETIME(0) DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY messageId (messageId),
    INDEX idx_sms_appId_sent (appId, sent),
    INDEX idx_sms_groupId (groupId),
    INDEX idx_sms_messageId (messageId)
);
