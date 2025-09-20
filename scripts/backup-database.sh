#!/bin/bash

# Automated Database Backup System for Mail Service
# This script creates backups only when the database has changed
# Usage: ./backup-database.sh [--force]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/mailservice_backup_$TIMESTAMP.sql"
LATEST_BACKUP_LINK="$BACKUP_DIR/latest_backup.sql"
CHECKSUM_FILE="$BACKUP_DIR/.last_checksum"
LOG_FILE="$BACKUP_DIR/backup.log"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Load database credentials from .env file
if [[ -f "$PROJECT_DIR/.env" ]]; then
    source <(grep -E "^DATABASE_URL=" "$PROJECT_DIR/.env" | sed 's/DATABASE_URL="mysql:\/\/\([^:]*\):\([^@]*\)@\([^:]*\):\([^\/]*\)\/\(.*\)"/DB_USER=\1\nDB_PASS=\2\nDB_HOST=\3\nDB_PORT=\4\nDB_NAME=\5/')
else
    echo "ERROR: .env file not found in $PROJECT_DIR" | tee -a "$LOG_FILE"
    exit 1
fi

# URL decode the password (handle %24 -> $, etc.)
DB_PASS=$(echo "$DB_PASS" | sed 's/%24/$/g; s/%26/\&/g; s/%2B/+/g; s/%3D/=/g; s/%2F/\//g')

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to calculate database checksum
calculate_db_checksum() {
    mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" \
        -e "SELECT table_name, table_rows, data_length, index_length, checksum 
            FROM information_schema.tables 
            WHERE table_schema = '$DB_NAME' 
            ORDER BY table_name;" \
        2>/dev/null | md5sum | cut -d' ' -f1
}

# Function to create backup
create_backup() {
    log "Creating database backup: $BACKUP_FILE"
    
    # Create the backup with structure and data
    mysqldump -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" \
        --single-transaction \
        --routines \
        --triggers \
        --events \
        --add-drop-table \
        --create-options \
        --disable-keys \
        --extended-insert \
        --quick \
        --lock-tables=false \
        --set-charset \
        "$DB_NAME" > "$BACKUP_FILE"
    
    if [[ $? -eq 0 ]]; then
        # Compress the backup
        gzip "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE}.gz"
        
        # Update latest backup link
        ln -sf "$(basename "$BACKUP_FILE")" "$LATEST_BACKUP_LINK"
        
        # Log backup info
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log "Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"
        
        # Update checksum
        echo "$CURRENT_CHECKSUM" > "$CHECKSUM_FILE"
        
        return 0
    else
        log "ERROR: Backup failed"
        return 1
    fi
}

# Function to cleanup old backups (keep last 168 backups - 1 week at hourly rate)
cleanup_old_backups() {
    log "Cleaning up old backups (keeping last 168 backups)"
    
    # Count current backups
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "mailservice_backup_*.sql.gz" | wc -l)
    
    if [[ $BACKUP_COUNT -gt 168 ]]; then
        # Remove oldest backups, keeping the 168 most recent
        find "$BACKUP_DIR" -name "mailservice_backup_*.sql.gz" -type f \
            | sort | head -n $((BACKUP_COUNT - 168)) \
            | xargs rm -f
        
        REMOVED_COUNT=$((BACKUP_COUNT - 168))
        log "Removed $REMOVED_COUNT old backup files"
    fi
}

# Main execution
log "=== Database Backup Process Started ==="

# Check if database is accessible
if ! mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" -e "USE $DB_NAME;" 2>/dev/null; then
    log "ERROR: Cannot connect to database $DB_NAME"
    exit 1
fi

# Calculate current database checksum
CURRENT_CHECKSUM=$(calculate_db_checksum)

# Check if we should force backup
FORCE_BACKUP=false
if [[ "${1:-}" == "--force" ]]; then
    FORCE_BACKUP=true
    log "Force backup requested"
fi

# Read previous checksum
if [[ -f "$CHECKSUM_FILE" ]] && [[ "$FORCE_BACKUP" != true ]]; then
    PREVIOUS_CHECKSUM=$(cat "$CHECKSUM_FILE")
    
    if [[ "$CURRENT_CHECKSUM" == "$PREVIOUS_CHECKSUM" ]]; then
        log "No database changes detected (checksum: $CURRENT_CHECKSUM) - skipping backup"
        exit 0
    else
        log "Database changes detected (old: $PREVIOUS_CHECKSUM, new: $CURRENT_CHECKSUM)"
    fi
else
    log "No previous checksum found or force backup requested"
fi

# Create backup
if create_backup; then
    cleanup_old_backups
    log "=== Database Backup Process Completed Successfully ==="
else
    log "=== Database Backup Process Failed ==="
    exit 1
fi