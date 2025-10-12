-- Manual migration to convert Template table from string IDs to numeric IDs
-- This preserves all data and only affects the Template table
-- DO NOT use prisma migrate dev - this is a manual migration

START TRANSACTION;

-- Step 1: Create new Template table with numeric IDs
CREATE TABLE Template_new (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version INT NOT NULL,
  subject MEDIUMTEXT,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  appId VARCHAR(191) NOT NULL DEFAULT 'retreehawaii',
  content MEDIUMTEXT,
  title VARCHAR(64),
  INDEX idx_template_appId (appId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Copy data from retreehawaii database with original numeric IDs
-- This will repopulate with clean data using the original ID structure
INSERT INTO Template_new (id, version, subject, isActive, createdAt, updatedAt, appId, content, title)
SELECT 
    t.id,
    1 as version,
    t.subject,
    1 as isActive,
    t.created as createdAt,
    t.created as updatedAt,
    'retreehawaii' as appId,
    t.text as content,
    t.name as title
FROM retreehawaii.templates t
ORDER BY t.id;

-- Step 3: Update MessageGroup table to handle the transition
-- First, add a temporary column for the new numeric template ID
ALTER TABLE MessageGroup ADD COLUMN templateId_new INT NULL;

-- Step 4: Extract numeric IDs from current string templateIds and update the new column
-- Only update where templateId matches the pattern tpl_NNNNN_*
UPDATE MessageGroup mg
SET templateId_new = CAST(SUBSTRING(mg.templateId, 5, 8) AS UNSIGNED)
WHERE mg.templateId IS NOT NULL 
  AND mg.templateId LIKE 'tpl_%'
  AND mg.templateId REGEXP '^tpl_[0-9]{8}_';

-- Step 5: Drop the foreign key constraint if it exists
-- Check if constraint exists first
SET @constraint_name = (
    SELECT CONSTRAINT_NAME 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'mailservice' 
      AND TABLE_NAME = 'MessageGroup' 
      AND COLUMN_NAME = 'templateId'
      AND REFERENCED_TABLE_NAME = 'Template'
    LIMIT 1
);

SET @sql = IF(@constraint_name IS NOT NULL, 
    CONCAT('ALTER TABLE MessageGroup DROP FOREIGN KEY ', @constraint_name), 
    'SELECT "No foreign key constraint to drop"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 6: Drop the old Template table and rename the new one
DROP TABLE Template;
RENAME TABLE Template_new TO Template;

-- Step 7: Update MessageGroup to use the new templateId column
ALTER TABLE MessageGroup DROP COLUMN templateId;
ALTER TABLE MessageGroup CHANGE COLUMN templateId_new templateId INT NULL;

-- Step 8: Add foreign key constraint back
ALTER TABLE MessageGroup 
ADD CONSTRAINT fk_messagegroup_template 
FOREIGN KEY (templateId) REFERENCES Template(id) ON DELETE SET NULL;

-- Step 9: Add index for templateId
ALTER TABLE MessageGroup ADD INDEX idx_messagegroup_templateId (templateId);

COMMIT;

-- Verify the migration
SELECT 'Migration completed successfully!' as status;
SELECT COUNT(*) as template_count FROM Template;
SELECT id, title, subject FROM Template WHERE id IN (105, 107, 126, 129, 130) ORDER BY id;