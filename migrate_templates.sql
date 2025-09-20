-- Migrate templates from retreehawaii.templates to mailservice.Template
-- Using the correct column names and structure

INSERT INTO mailservice.Template (
    id,
    appId,
    title,
    subject,
    content,
    version,
    isActive,
    createdAt,
    updatedAt
)
SELECT 
    CONCAT('tpl_', LPAD(rt.id, 8, '0'), '_', LOWER(REPLACE(REPLACE(rt.name, ' ', '_'), '-', '_'))) as id,
    'cmfka688r0001b77ofpgm57ix' as appId,
    rt.name as title,
    rt.subject as subject,
    rt.text as content,
    1 as version,
    1 as isActive,
    COALESCE(rt.created, NOW()) as createdAt,
    COALESCE(rt.created, NOW()) as updatedAt
FROM retreehawaii.templates rt
WHERE rt.name IS NOT NULL 
  AND rt.name != ''
  AND rt.text IS NOT NULL
  AND rt.text != '';