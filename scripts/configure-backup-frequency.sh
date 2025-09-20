#!/bin/bash

# Configure Backup Frequency
# Usage: ./configure-backup-frequency.sh [hourly|daily|custom]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-database.sh"
SETUP_SCRIPT="$SCRIPT_DIR/setup-backup-cron.sh"

show_usage() {
    echo "Usage: $0 [hourly|daily|custom]"
    echo ""
    echo "Frequencies:"
    echo "  hourly  - Run backup every hour (default)"
    echo "  daily   - Run backup once per day at 2 AM"
    echo "  custom  - Specify custom cron schedule"
    echo ""
    echo "Current schedule:"
    if crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT" >/dev/null; then
        crontab -l 2>/dev/null | grep -F "$BACKUP_SCRIPT"
    else
        echo "  No backup schedule configured"
    fi
}

set_frequency() {
    local frequency="$1"
    local cron_schedule=""
    
    case "$frequency" in
        hourly)
            cron_schedule="0 * * * *"
            echo "Setting backup frequency to: Every hour at minute 0"
            ;;
        daily)
            cron_schedule="0 2 * * *"
            echo "Setting backup frequency to: Daily at 2:00 AM"
            ;;
        custom)
            echo "Enter custom cron schedule (e.g., '0 */6 * * *' for every 6 hours):"
            read -p "Cron schedule: " cron_schedule
            if [[ -z "$cron_schedule" ]]; then
                echo "ERROR: Empty schedule provided"
                exit 1
            fi
            echo "Setting backup frequency to: $cron_schedule"
            ;;
        *)
            echo "ERROR: Invalid frequency: $frequency"
            show_usage
            exit 1
            ;;
    esac
    
    # Remove existing backup cron job
    "$SETUP_SCRIPT" uninstall
    
    # Install new cron job with custom schedule
    CRON_ENTRY="$cron_schedule cd '$PROJECT_DIR' && '$BACKUP_SCRIPT' >> '$PROJECT_DIR/backups/cron.log' 2>&1"
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    
    echo "✅ Backup frequency updated successfully!"
    echo "📅 New schedule: $cron_schedule"
    echo ""
    echo "To verify, run: crontab -l | grep backup"
}

# Parse command
case "${1:-}" in
    hourly|daily|custom)
        set_frequency "$1"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac