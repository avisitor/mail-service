#!/bin/bash

# Database Restore Script for Mail Service
# Usage: ./restore-database.sh [backup_file] [--confirm]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$BACKUP_DIR/restore.log"

# Load database credentials from .env file
if [[ -f "$PROJECT_DIR/.env" ]]; then
    source <(grep -E "^DATABASE_URL=" "$PROJECT_DIR/.env" | sed 's/DATABASE_URL="mysql:\/\/\([^:]*\):\([^@]*\)@\([^:]*\):\([^\/]*\)\/\(.*\)"/DB_USER=\1\nDB_PASS=\2\nDB_HOST=\3\nDB_PORT=\4\nDB_NAME=\5/')
else
    echo "ERROR: .env file not found in $PROJECT_DIR"
    exit 1
fi

# URL decode the password
DB_PASS=$(echo "$DB_PASS" | sed 's/%24/$/g; s/%26/\&/g; s/%2B/+/g; s/%3D/=/g; s/%2F/\//g')

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

show_usage() {
    echo "Usage: $0 [backup_file] [--confirm]"
    echo ""
    echo "Options:"
    echo "  backup_file    Path to backup file (if not specified, uses latest)"
    echo "  --confirm      Skip confirmation prompt"
    echo ""
    echo "Available backups:"
    if [[ -d "$BACKUP_DIR" ]]; then
        find "$BACKUP_DIR" -name "mailservice_backup_*.sql.gz" -type f | sort -r | head -10 | while read -r file; do
            size=$(du -h "$file" | cut -f1)
            date=$(basename "$file" | sed 's/mailservice_backup_\([0-9]*_[0-9]*\)\.sql\.gz/\1/' | sed 's/_/ /')
            echo "  $(basename "$file") ($size) - $date"
        done
    else
        echo "  No backups found in $BACKUP_DIR"
    fi
}

# Parse arguments
BACKUP_FILE=""
CONFIRM=false

for arg in "$@"; do
    case $arg in
        --confirm)
            CONFIRM=true
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            if [[ -z "$BACKUP_FILE" ]]; then
                BACKUP_FILE="$arg"
            fi
            ;;
    esac
done

# If no backup file specified, use latest
if [[ -z "$BACKUP_FILE" ]]; then
    LATEST_LINK="$BACKUP_DIR/latest_backup.sql"
    if [[ -L "$LATEST_LINK" ]]; then
        BACKUP_FILE="$BACKUP_DIR/$(readlink "$LATEST_LINK")"
    else
        # Find most recent backup
        BACKUP_FILE=$(find "$BACKUP_DIR" -name "mailservice_backup_*.sql.gz" -type f | sort -r | head -1)
    fi
fi

# Validate backup file
if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    show_usage
    exit 1
fi

# Show what we're about to do
echo "=== DATABASE RESTORE OPERATION ==="
echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "Backup file: $BACKUP_FILE"
echo "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo ""
echo "⚠️  WARNING: This will COMPLETELY REPLACE all data in the database!"
echo "⚠️  All current data will be PERMANENTLY LOST!"
echo ""

# Confirmation
if [[ "$CONFIRM" != true ]]; then
    read -p "Are you absolutely sure you want to proceed? Type 'yes' to continue: " confirmation
    if [[ "$confirmation" != "yes" ]]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Create a backup before restore (safety measure)
log "Creating safety backup before restore..."
SAFETY_BACKUP="$BACKUP_DIR/pre_restore_backup_$(date '+%Y%m%d_%H%M%S').sql.gz"
mysqldump -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    "$DB_NAME" | gzip > "$SAFETY_BACKUP"

log "Safety backup created: $SAFETY_BACKUP"

# Perform restore
log "Starting database restore from: $BACKUP_FILE"

# Drop and recreate database to ensure clean state
mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" \
    -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Restore from backup
if [[ "$BACKUP_FILE" == *.gz ]]; then
    zcat "$BACKUP_FILE" | mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME"
else
    mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" < "$BACKUP_FILE"
fi

if [[ $? -eq 0 ]]; then
    log "Database restore completed successfully"
    
    # Verify the restore by checking table count
    TABLE_COUNT=$(mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" \
        -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DB_NAME';" -s -N)
    
    log "Restore verification: $TABLE_COUNT tables found in database"
    echo "✅ Database restore completed successfully!"
    echo "📊 $TABLE_COUNT tables restored"
else
    log "ERROR: Database restore failed"
    echo "❌ Database restore failed!"
    exit 1
fi