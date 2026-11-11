# Mail Log Migration Scripts

This directory contains scripts to migrate maillog data from external databases (retreehawaii and outings) to the central mail-service database.

## Scripts

### `migrate-maillog-data.sh`
Basic migration script that copies the latest N entries from each source database.

**Usage:**
```bash
./migrate-maillog-data.sh [number_of_records]
```

**Examples:**
```bash
./migrate-maillog-data.sh          # Import latest 10 records (default)
./migrate-maillog-data.sh 20       # Import latest 20 records
```

**⚠️ Warning:** This script will create duplicate entries if run multiple times with overlapping data.

### `migrate-maillog-data-safe.sh` (Recommended)
Enhanced migration script that avoids duplicates by only importing records newer than the latest existing entry for each app.

**Usage:**
```bash
./migrate-maillog-data-safe.sh [number_of_records]
```

**Examples:**
```bash
./migrate-maillog-data-safe.sh     # Import new records (default limit 10)
./migrate-maillog-data-safe.sh 50  # Import new records (limit 50)
```

**✅ Safe:** This script can be run repeatedly without creating duplicates.

## Configuration

The two scripts resolve credentials differently:

- **`migrate-maillog-data.sh`**: `DB_USER` / `DB_PASS` (defaults at the top of the script).
- **`migrate-maillog-data-safe.sh`**: reads credentials from environment files, not from `DB_USER`/`DB_PASS`:
  - `/var/www/html/mail-service/.env` (`DATABASE_URL`) for the target database
  - `/var/www/html/retree-hawaii/.env` (`DB_USERNAME`, `DB_PASSWORD`, …)
  - `/var/www/html/outings/.env.s` (`DB_USER`, `DB_PASSWORD`, …)
  - `/var/www/html/outings/.env.maunaala` (`DB_USER`, `DB_PASSWORD`, …)

Other configuration:

- **App IDs**:
  - ReTree Hawaii: `cmfka688r0001b77ofpgm57ix`
  - Outings: `outings-app-id`
  - Maunaala: `maunaala-app-id`
- **Default record limit**: 10 records per source

## Source Databases

- **retreehawaii.maillog**: Email logs from the ReTree Hawaii application
- **outings.maillog**: Email logs from the Outings application
- **maunaala.maillog**: Email logs from the Outings Maunaala deployment

## Target Database

- **mailservice.Maillog**: Unified email log table with app-specific filtering

## Field Mapping

| Source Field | Target Field | Notes |
|--------------|--------------|-------|
| sent | sent | DateTime of email sent |
| subject | subject | Email subject line |
| sendername | senderName | Sender display name |
| senderemail | senderEmail | Sender email address |
| recipients | recipients | Recipients (JSON format) |
| message | message | Email content (truncated to 10K chars) |
| - | appId | Generated based on source database |
| - | id | Generated UUID with prefix |

## Generated Fields

- **id**: `retree-{uuid}`, `outings-{uuid}` or `maunaala-{uuid}` for unique identification
- **appId**: Assigned based on source database for filtering in the UI

## Monitoring

After running either script, you can check the results with:

```bash
mysql -u laana -p mailservice -e "
SELECT 
    appId,
    COUNT(*) as total_records,
    MAX(sent) as latest_entry,
    MIN(sent) as oldest_entry
FROM Maillog 
GROUP BY appId 
ORDER BY total_records DESC;
"
```

## Scheduling

To automatically sync new records, you could add the safe script to a cron job:

```bash
# Run every hour to sync new mail logs
0 * * * * /path/to/mail-service/migrate-maillog-data-safe.sh
```