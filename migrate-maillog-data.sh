#!/bin/bash

# Mail Service Data Migration Script
# This script copies the latest maillog entries from retreehawaii and outings databases
# to the central mailservice database for unified log viewing.

# Database connection settings
DB_USER="laana"
DB_PASS="0\$o7Z&93"
DB_HOST="localhost"

# Configuration
RETREE_APP_ID="cmfka688r0001b77ofpgm57ix"
OUTINGS_APP_ID="outings-app-id"
RECORDS_LIMIT=${1:-10}  # Default to 10 records, can be overridden with first argument

echo "Starting mail log data migration..."
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

# Migrate from retreehawaii.maillog
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
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "mailservice" "$RETREE_SQL" "Import $RECORDS_LIMIT latest entries from retreehawaii.maillog"

# Migrate from outings.maillog
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
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "mailservice" "$OUTINGS_SQL" "Import $RECORDS_LIMIT latest entries from outings.maillog"

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

echo ""
echo "🎉 Mail log data migration completed successfully!"
echo "Usage: $0 [number_of_records]"
echo "Example: $0 20  # Import latest 20 records from each source"
echo ""
echo "Note: This script will create duplicate entries if run multiple times."
echo "To avoid duplicates, consider adding WHERE clauses to exclude existing records."