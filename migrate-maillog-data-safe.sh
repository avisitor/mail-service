#!/bin/bash

# Mail Service Data Migration Script (Duplicate-Safe Version)
# This script copies the latest maillog entries from retreehawaii and outings databases
# to the central mailservice database, avoiding duplicates by checking existing records.

# Database connection settings
DB_USER="laana"
DB_PASS="0\$o7Z&93"
DB_HOST="localhost"

# Configuration
RETREE_APP_ID="cmfka688r0001b77ofpgm57ix"
OUTINGS_APP_ID="outings-app-id"
RECORDS_LIMIT=${1:-10}  # Default to 10 records, can be overridden with first argument

echo "Starting mail log data migration (duplicate-safe)..."
echo "Migrating latest $RECORDS_LIMIT entries from each source database"
echo "Date: $(date)"
echo ""

# Function to execute SQL and handle errors
execute_sql() {
    local database=$1
    local sql=$2
    local description=$3
    
    echo "Executing: $description"
    if mysql -u "$DB_USER" -p"$DB_PASS" "$database" -e "$sql"; then
        echo "✅ Success: $description"
    else
        echo "❌ Error: $description failed"
        exit 1
    fi
    echo ""
}

# Function to get the latest sent date for an app
get_latest_sent_date() {
    local app_id=$1
    mysql -u "$DB_USER" -p"$DB_PASS" mailservice -N -e "SELECT COALESCE(MAX(sent), '1900-01-01') FROM Maillog WHERE appId = '$app_id';" 2>/dev/null
}

# Get the latest existing dates
echo "=== Checking existing data ==="
RETREE_LATEST=$(get_latest_sent_date "$RETREE_APP_ID")
OUTINGS_LATEST=$(get_latest_sent_date "$OUTINGS_APP_ID")

echo "Latest ReTree Hawaii entry: $RETREE_LATEST"
echo "Latest Outings entry: $OUTINGS_LATEST"
echo ""

# Migrate from retreehawaii.maillog (only newer records)
echo "=== Migrating from ReTree Hawaii ==="
RETREE_SQL="
INSERT INTO Maillog (id, sent, subject, senderName, senderEmail, recipients, message, appId)
SELECT 
    CONCAT('retree-', REPLACE(UUID(), '-', '')) as id,
    sent,
    subject,
    sendername,
    senderemail,
    recipients,
    LEFT(message, 10000) as message,
    '$RETREE_APP_ID' as appId
FROM retreehawaii.maillog 
WHERE sent > '$RETREE_LATEST'
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "mailservice" "$RETREE_SQL" "Import new entries from retreehawaii.maillog (newer than $RETREE_LATEST)"

# Migrate from outings.maillog (only newer records)
echo "=== Migrating from Outings ==="
OUTINGS_SQL="
INSERT INTO Maillog (id, sent, subject, senderName, senderEmail, recipients, message, appId)
SELECT 
    CONCAT('outings-', REPLACE(UUID(), '-', '')) as id,
    sent,
    subject,
    sendername,
    senderemail,
    recipients,
    LEFT(message, 10000) as message,
    '$OUTINGS_APP_ID' as appId
FROM outings.maillog 
WHERE sent > '$OUTINGS_LATEST'
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "mailservice" "$OUTINGS_SQL" "Import new entries from outings.maillog (newer than $OUTINGS_LATEST)"

# Show summary
echo "=== Migration Summary ==="
SUMMARY_SQL="
SELECT 
    appId,
    COUNT(*) as total_records,
    MAX(sent) as latest_entry,
    MIN(sent) as oldest_entry
FROM Maillog 
GROUP BY appId 
ORDER BY total_records DESC;
"

execute_sql "mailservice" "$SUMMARY_SQL" "Display migration summary"

# Show what was actually imported this run
echo "=== New Records Added This Run ==="
NEW_RETREE_COUNT=$(mysql -u "$DB_USER" -p"$DB_PASS" mailservice -N -e "SELECT COUNT(*) FROM Maillog WHERE appId = '$RETREE_APP_ID' AND sent > '$RETREE_LATEST';" 2>/dev/null)
NEW_OUTINGS_COUNT=$(mysql -u "$DB_USER" -p"$DB_PASS" mailservice -N -e "SELECT COUNT(*) FROM Maillog WHERE appId = '$OUTINGS_APP_ID' AND sent > '$OUTINGS_LATEST';" 2>/dev/null)

echo "ReTree Hawaii: $NEW_RETREE_COUNT new records added"
echo "Outings: $NEW_OUTINGS_COUNT new records added"

echo ""
echo "🎉 Mail log data migration completed successfully!"
echo "Usage: $0 [number_of_records]"
echo "Example: $0 20  # Import latest 20 new records from each source"
echo ""
echo "Note: This script only imports records newer than existing ones, avoiding duplicates."