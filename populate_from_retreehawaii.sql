-- SQL script to populate mail-service Template and Maillog tables 
-- with data from retreehawaii database

-- Set charset to handle UTF-8 characters properly
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- First, clear any existing data 
DELETE FROM mailservice.Template WHERE appId = 'cmfka688r0001b77ofpgm57ix';
DELETE FROM mailservice.Maillog WHERE appId = 'cmfka688r0001b77ofpgm57ix';

-- Populate Template table from retreehawaii.templates
INSERT INTO mailservice.Template (
    id,
    appId,
    name,
    title,
    description, 
    content,
    version,
    subject,
    bodyHtml,
    bodyText,
    variables,
    isActive,
    createdAt,
    updatedAt
)
SELECT 
    CONCAT('tpl_', LPAD(rt.id, 8, '0'), '_', LOWER(REPLACE(rt.name, ' ', '_'))) as id,
    'cmfka688r0001b77ofpgm57ix' as appId,
    CONCAT(rt.name, ' (', rt.id, ')') as name,  -- Make names unique by adding ID
    rt.name as title,
    CONCAT('Template: ', rt.subject) as description,
    rt.text as content,
    1 as version,
    rt.subject as subject,
    rt.text as bodyHtml,
    NULL as bodyText,
    '{}' as variables,
    1 as isActive,
    COALESCE(rt.created, NOW()) as createdAt,
    COALESCE(rt.created, NOW()) as updatedAt
FROM retreehawaii.templates rt
WHERE rt.name IS NOT NULL AND rt.name != '';

-- Populate Maillog table from retreehawaii.maillog (all entries, skipping duplicates)
INSERT IGNORE INTO mailservice.Maillog (
    id,
    messageId,
    groupId,
    appId,
    sent,
    subject,
    senderName,
    senderEmail,
    host,
    username,
    recipients,
    message,
    opened,
    createdAt
)
SELECT 
    CONCAT('ml_', SUBSTRING(UUID(), 1, 8), '_', rm.id) as id,  -- Unique ID using original message ID
    rm.id as messageId,
    rm.groupid as groupId,
    'cmfka688r0001b77ofpgm57ix' as appId,
    COALESCE(rm.sent, NOW()) as sent,
    rm.subject as subject,
    rm.sendername as senderName,
    rm.senderemail as senderEmail,
    rm.host as host,
    rm.username as username,
    rm.recipients as recipients,
    rm.message as message,
    rm.opened as opened,
    COALESCE(rm.sent, NOW()) as createdAt
FROM retreehawaii.maillog rm
WHERE rm.sent IS NOT NULL
ORDER BY rm.sent DESC;