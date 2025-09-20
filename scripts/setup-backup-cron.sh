#!/bin/bash

# Setup Automated Database Backups
# This script configures cron to run backups automatically

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-database.sh"

show_usage() {
    echo "Usage: $0 [install|uninstall|status|test]"
    echo ""
    echo "Commands:"
    echo "  install    - Install hourly backup cron job"
    echo "  uninstall  - Remove backup cron job"
    echo "  status     - Show current backup schedule"
    echo "  test       - Test backup script"
    echo ""
    echo "The backup will run every hour and only create backups when data has changed."
}

install_cron() {
    echo "Installing automated backup cron job..."
    
    # Create cron entry (runs every hour at minute 0)
    CRON_ENTRY="0 * * * * cd '$PROJECT_DIR' && '$BACKUP_SCRIPT' >> '$PROJECT_DIR/backups/cron.log' 2>&1"
    
    # Check if entry already exists
    if crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT" >/dev/null; then
        echo "⚠️  Backup cron job already exists. Removing old entry first..."
        crontab -l 2>/dev/null | grep -v -F "$BACKUP_SCRIPT" | crontab -
    fi
    
    # Add new entry
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    
    echo "✅ Automated backup installed successfully!"
    echo "📅 Backups will run every hour at minute 0"
    echo "📁 Backup location: $PROJECT_DIR/backups/"
    echo "📝 Cron logs: $PROJECT_DIR/backups/cron.log"
    echo ""
    echo "To check if it's working, run: tail -f $PROJECT_DIR/backups/cron.log"
}

uninstall_cron() {
    echo "Removing automated backup cron job..."
    
    if crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT" >/dev/null; then
        crontab -l 2>/dev/null | grep -v -F "$BACKUP_SCRIPT" | crontab -
        echo "✅ Backup cron job removed successfully!"
    else
        echo "ℹ️  No backup cron job found to remove."
    fi
}

show_status() {
    echo "=== Backup System Status ==="
    echo ""
    
    # Check if cron job exists
    if crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT" >/dev/null; then
        echo "✅ Automated backup: ENABLED"
        echo "📅 Schedule: Every hour at minute 0"
        crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT"
    else
        echo "❌ Automated backup: DISABLED"
        echo "Run '$0 install' to enable automated backups"
    fi
    
    echo ""
    
    # Show backup directory info
    if [[ -d "$PROJECT_DIR/backups" ]]; then
        BACKUP_COUNT=$(find "$PROJECT_DIR/backups" -name "mailservice_backup_*.sql.gz" 2>/dev/null | wc -l)
        echo "📁 Backup directory: $PROJECT_DIR/backups/"
        echo "📊 Current backups: $BACKUP_COUNT files"
        
        if [[ $BACKUP_COUNT -gt 0 ]]; then
            echo "🕐 Latest backup:"
            find "$PROJECT_DIR/backups" -name "mailservice_backup_*.sql.gz" -type f \
                | sort -r | head -1 | while read -r file; do
                size=$(du -h "$file" | cut -f1)
                date_str=$(basename "$file" | sed 's/mailservice_backup_\([0-9]*\)_\([0-9]*\)\.sql\.gz/\1 \2/' | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\) \([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
                echo "   $(basename "$file") ($size) - $date_str"
            done
        fi
        
        # Show recent log entries
        if [[ -f "$PROJECT_DIR/backups/backup.log" ]]; then
            echo ""
            echo "📝 Recent backup activity:"
            tail -5 "$PROJECT_DIR/backups/backup.log" | sed 's/^/   /'
        fi
    else
        echo "❌ Backup directory not found: $PROJECT_DIR/backups/"
    fi
}

test_backup() {
    echo "Testing backup script..."
    echo ""
    
    if [[ ! -x "$BACKUP_SCRIPT" ]]; then
        echo "❌ Backup script not found or not executable: $BACKUP_SCRIPT"
        exit 1
    fi
    
    echo "Running backup script in test mode..."
    cd "$PROJECT_DIR"
    "$BACKUP_SCRIPT" --force
    
    echo ""
    echo "✅ Backup test completed successfully!"
}

# Parse command
case "${1:-}" in
    install)
        install_cron
        ;;
    uninstall)
        uninstall_cron
        ;;
    status)
        show_status
        ;;
    test)
        test_backup
        ;;
    *)
        show_usage
        exit 1
        ;;
esac