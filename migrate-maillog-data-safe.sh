#!/bin/bash

# Mail Service Data Migration Script (Duplicate-Safe Version)
# This script copies the latest maillog entries from retreehawaii and outings databases
# to the central mailservice database, avoiding duplicates by checking existing records.

# Environment files for database credentials
MAILSERVICE_ENV="/var/www/html/mail-service/.env"
OUTINGS_ENV="/var/www/html/outings/.env.s"
MAUNAALA_ENV="/var/www/html/outings/.env.maunaala"
RETREE_ENV="/var/www/html/retree-hawaii/.env"

# Configuration
RETREE_APP_ID="cmfka688r0001b77ofpgm57ix"
OUTINGS_APP_ID="outings-app-id"
MAUNAALA_APP_ID="maunaala-app-id"
RECORDS_LIMIT=${1:-10}  # Default to 10 records, can be overridden with first argument

echo "Starting mail log data migration (duplicate-safe)..."
echo "Migrating latest $RECORDS_LIMIT entries from each source database"
echo "Date: $(date)"
echo ""

get_env_value() {
    local env_file=$1
    local key=$2
    local line

    if [[ ! -f "$env_file" ]]; then
        echo ""
        return
    fi

    line=$(grep -E "^[[:space:]]*${key}=" "$env_file" | head -n 1)
    if [[ -z "$line" ]]; then
        echo ""
        return
    fi

    line=${line#*=}
    line=${line%$'\r'}
    if [[ ${line:0:1} == '"' && ${line: -1} == '"' ]]; then
        line=${line:1:-1}
    elif [[ ${line:0:1} == "'" && ${line: -1} == "'" ]]; then
        line=${line:1:-1}
    fi

    echo "$line"
}

parse_database_url() {
    local url=$1
    url=${url#mysql://}
    local creds_host=${url%%/*}
    local db=${url#*/}
    db=${db%%\?*}

    local creds=${creds_host%@*}
    local hostport=${creds_host#*@}

    local user=${creds%%:*}
    local pass=${creds#*:}
    if [[ "$creds" == "$user" ]]; then
        pass=""
    fi

    local host=${hostport%%:*}
    local port=${hostport#*:}
    if [[ "$hostport" == "$host" ]]; then
        port="3306"
    fi

    echo "${user}|${pass}|${host}|${port}|${db}"
}

build_mysql_args() {
    local user=$1
    local pass=$2
    local host=$3
    local port=$4
    local socket=$5

    local args=("-u" "$user")
    if [[ -n "$pass" ]]; then
        args+=("-p$pass")
    fi
    if [[ -n "$socket" && -S "$socket" ]]; then
        args+=("--socket" "$socket")
    else
        args+=("-h" "$host" "-P" "$port")
    fi

    echo "${args[@]}"
}

require_env_file() {
    local env_file=$1
    if [[ ! -f "$env_file" ]]; then
        echo "❌ Missing env file: $env_file"
        exit 1
    fi
}

require_env_file "$MAILSERVICE_ENV"
require_env_file "$OUTINGS_ENV"
require_env_file "$MAUNAALA_ENV"
require_env_file "$RETREE_ENV"

MAILSERVICE_DATABASE_URL=$(get_env_value "$MAILSERVICE_ENV" "DATABASE_URL")
if [[ -z "$MAILSERVICE_DATABASE_URL" ]]; then
    echo "❌ Missing DATABASE_URL in $MAILSERVICE_ENV"
    exit 1
fi

MAILSERVICE_PARSED=$(parse_database_url "$MAILSERVICE_DATABASE_URL")
MAILSERVICE_USER=${MAILSERVICE_PARSED%%|*}
MAILSERVICE_REST=${MAILSERVICE_PARSED#*|}
MAILSERVICE_PASS=${MAILSERVICE_REST%%|*}
MAILSERVICE_REST=${MAILSERVICE_REST#*|}
MAILSERVICE_HOST=${MAILSERVICE_REST%%|*}
MAILSERVICE_REST=${MAILSERVICE_REST#*|}
MAILSERVICE_PORT=${MAILSERVICE_REST%%|*}
MAILSERVICE_DB=${MAILSERVICE_REST#*|}

RETREE_DB_HOST=$(get_env_value "$RETREE_ENV" "DB_HOST")
RETREE_DB_SOCKET=$(get_env_value "$RETREE_ENV" "DB_SOCKET")
RETREE_DB_PORT=$(get_env_value "$RETREE_ENV" "DB_PORT")
RETREE_DB_NAME=$(get_env_value "$RETREE_ENV" "DB_DATABASE")
RETREE_DB_USER=$(get_env_value "$RETREE_ENV" "DB_USERNAME")
RETREE_DB_PASS=$(get_env_value "$RETREE_ENV" "DB_PASSWORD")

OUTINGS_DB_HOST=$(get_env_value "$OUTINGS_ENV" "DB_SERVER")
OUTINGS_DB_SOCKET=$(get_env_value "$OUTINGS_ENV" "DB_SOCKET")
OUTINGS_DB_PORT=$(get_env_value "$OUTINGS_ENV" "DB_PORT")
OUTINGS_DB_NAME=$(get_env_value "$OUTINGS_ENV" "DB_DATABASE")
OUTINGS_DB_USER=$(get_env_value "$OUTINGS_ENV" "DB_USER")
OUTINGS_DB_PASS=$(get_env_value "$OUTINGS_ENV" "DB_PASSWORD")

MAUNAALA_DB_HOST=$(get_env_value "$MAUNAALA_ENV" "DB_SERVER")
MAUNAALA_DB_SOCKET=$(get_env_value "$MAUNAALA_ENV" "DB_SOCKET")
MAUNAALA_DB_PORT=$(get_env_value "$MAUNAALA_ENV" "DB_PORT")
MAUNAALA_DB_NAME=$(get_env_value "$MAUNAALA_ENV" "DB_DATABASE")
MAUNAALA_DB_USER=$(get_env_value "$MAUNAALA_ENV" "DB_USER")
MAUNAALA_DB_PASS=$(get_env_value "$MAUNAALA_ENV" "DB_PASSWORD")

MAILSERVICE_ARGS=$(build_mysql_args "$MAILSERVICE_USER" "$MAILSERVICE_PASS" "$MAILSERVICE_HOST" "$MAILSERVICE_PORT" "")
RETREE_ARGS=$(build_mysql_args "$RETREE_DB_USER" "$RETREE_DB_PASS" "$RETREE_DB_HOST" "${RETREE_DB_PORT:-3306}" "$RETREE_DB_SOCKET")
OUTINGS_ARGS=$(build_mysql_args "$OUTINGS_DB_USER" "$OUTINGS_DB_PASS" "$OUTINGS_DB_HOST" "${OUTINGS_DB_PORT:-3306}" "$OUTINGS_DB_SOCKET")
MAUNAALA_ARGS=$(build_mysql_args "$MAUNAALA_DB_USER" "$MAUNAALA_DB_PASS" "$MAUNAALA_DB_HOST" "${MAUNAALA_DB_PORT:-3306}" "$MAUNAALA_DB_SOCKET")

# Function to execute SQL and handle errors
execute_sql() {
    local mysql_args=$1
    local database=$2
    local sql=$3
    local description=$4

    echo "Executing: $description"
    if mysql $mysql_args "$database" -e "$sql"; then
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
    mysql $MAILSERVICE_ARGS "$MAILSERVICE_DB" -N -e "SELECT COALESCE(MAX(sent), '1900-01-01') FROM Maillog WHERE appId = '$app_id';" 2>/dev/null
}

# Get the latest existing dates
echo "=== Checking existing data ==="
RETREE_LATEST=$(get_latest_sent_date "$RETREE_APP_ID")
OUTINGS_LATEST=$(get_latest_sent_date "$OUTINGS_APP_ID")
MAUNAALA_LATEST=$(get_latest_sent_date "$MAUNAALA_APP_ID")

echo "Latest ReTree Hawaii entry: $RETREE_LATEST"
echo "Latest Outings entry: $OUTINGS_LATEST"
echo "Latest Maunaala entry: $MAUNAALA_LATEST"
echo ""

# Migrate from retreehawaii.maillog (only newer records)
echo "=== Migrating from ReTree Hawaii ==="
RETREE_SQL="
INSERT INTO ${MAILSERVICE_DB}.Maillog (id, sent, subject, senderName, senderEmail, recipients, message, appId)
SELECT 
    CONCAT('retree-', REPLACE(UUID(), '-', '')) as id,
    sent,
    subject,
    sendername,
    senderemail,
    recipients,
    LEFT(message, 10000) as message,
    '$RETREE_APP_ID' as appId
FROM ${RETREE_DB_NAME}.maillog 
WHERE sent > '$RETREE_LATEST'
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "$RETREE_ARGS" "$RETREE_DB_NAME" "$RETREE_SQL" "Import new entries from ${RETREE_DB_NAME}.maillog (newer than $RETREE_LATEST)"

# Migrate from outings.maillog (only newer records)
echo "=== Migrating from Outings ==="
OUTINGS_SQL="
INSERT INTO ${MAILSERVICE_DB}.Maillog (id, sent, subject, senderName, senderEmail, recipients, message, appId)
SELECT 
    CONCAT('outings-', REPLACE(UUID(), '-', '')) as id,
    sent,
    subject,
    sendername,
    senderemail,
    recipients,
    LEFT(message, 10000) as message,
    '$OUTINGS_APP_ID' as appId
FROM ${OUTINGS_DB_NAME}.maillog 
WHERE sent > '$OUTINGS_LATEST'
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "$OUTINGS_ARGS" "$OUTINGS_DB_NAME" "$OUTINGS_SQL" "Import new entries from ${OUTINGS_DB_NAME}.maillog (newer than $OUTINGS_LATEST)"

# Migrate from maunaala.maillog (only newer records)
echo "=== Migrating from Maunaala ==="
MAUNAALA_SQL="
INSERT INTO ${MAILSERVICE_DB}.Maillog (id, sent, subject, senderName, senderEmail, recipients, message, appId)
SELECT 
    CONCAT('maunaala-', REPLACE(UUID(), '-', '')) as id,
    sent,
    subject,
    sendername,
    senderemail,
    recipients,
    LEFT(message, 10000) as message,
    '$MAUNAALA_APP_ID' as appId
FROM ${MAUNAALA_DB_NAME}.maillog 
WHERE sent > '$MAUNAALA_LATEST'
ORDER BY sent DESC 
LIMIT $RECORDS_LIMIT;
"

execute_sql "$MAUNAALA_ARGS" "$MAUNAALA_DB_NAME" "$MAUNAALA_SQL" "Import new entries from ${MAUNAALA_DB_NAME}.maillog (newer than $MAUNAALA_LATEST)"

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

execute_sql "$MAILSERVICE_ARGS" "$MAILSERVICE_DB" "$SUMMARY_SQL" "Display migration summary"

# Show what was actually imported this run
echo "=== New Records Added This Run ==="
NEW_RETREE_COUNT=$(mysql $MAILSERVICE_ARGS "$MAILSERVICE_DB" -N -e "SELECT COUNT(*) FROM Maillog WHERE appId = '$RETREE_APP_ID' AND sent > '$RETREE_LATEST';" 2>/dev/null)
NEW_OUTINGS_COUNT=$(mysql $MAILSERVICE_ARGS "$MAILSERVICE_DB" -N -e "SELECT COUNT(*) FROM Maillog WHERE appId = '$OUTINGS_APP_ID' AND sent > '$OUTINGS_LATEST';" 2>/dev/null)
NEW_MAUNAALA_COUNT=$(mysql $MAILSERVICE_ARGS "$MAILSERVICE_DB" -N -e "SELECT COUNT(*) FROM Maillog WHERE appId = '$MAUNAALA_APP_ID' AND sent > '$MAUNAALA_LATEST';" 2>/dev/null)

echo "ReTree Hawaii: $NEW_RETREE_COUNT new records added"
echo "Outings: $NEW_OUTINGS_COUNT new records added"
echo "Maunaala: $NEW_MAUNAALA_COUNT new records added"

echo ""
echo "🎉 Mail log data migration completed successfully!"
echo "Usage: $0 [number_of_records]"
echo "Example: $0 20  # Import latest 20 new records from each source"
echo ""
echo "Note: This script only imports records newer than existing ones, avoiding duplicates."