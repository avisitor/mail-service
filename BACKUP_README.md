# Database Backup System

This automated backup system protects your mail-service database from data loss by creating regular backups only when data has changed.

## 🚨 **CRITICAL: This system was created because the database was accidentally reset twice despite explicit instructions not to reset it.**

## Features

- **Change Detection**: Only creates backups when database content changes (using checksums)
- **Automatic Compression**: All backups are gzipped to save space
- **Retention Policy**: Keeps last 168 backups (1 week at hourly rate)
- **Safety Backups**: Creates safety backup before any restore operation
- **Comprehensive Logging**: All operations are logged with timestamps

## Quick Start

### Install Automated Backups
```bash
./scripts/setup-backup-cron.sh install
```

### Check Status
```bash
./scripts/setup-backup-cron.sh status
```

### Create Manual Backup
```bash
./scripts/backup-database.sh --force
```

### Restore from Backup
```bash
./scripts/restore-database.sh                    # Use latest backup
./scripts/restore-database.sh path/to/backup.sql.gz --confirm
```

## Backup Frequency Configuration

### Current Setup (Hourly)
- Runs every hour at minute 0
- Only creates backup if data has changed
- Typical usage: Development/testing phase

### Change to Daily (Recommended for Production)
```bash
./scripts/configure-backup-frequency.sh daily
```

### Custom Schedule
```bash
./scripts/configure-backup-frequency.sh custom
# Then enter your cron schedule (e.g., "0 */6 * * *" for every 6 hours)
```

## File Locations

- **Backups**: `./backups/mailservice_backup_YYYYMMDD_HHMMSS.sql.gz`
- **Latest Link**: `./backups/latest_backup.sql` (symlink to most recent)
- **Backup Log**: `./backups/backup.log`
- **Cron Log**: `./backups/cron.log`
- **Checksum File**: `./backups/.last_checksum` (for change detection)

## Scripts

### `backup-database.sh`
Creates database backups with change detection.
```bash
./scripts/backup-database.sh           # Only backup if changed
./scripts/backup-database.sh --force   # Force backup regardless
```

### `restore-database.sh`
Restores database from backup.
```bash
./scripts/restore-database.sh                           # Use latest
./scripts/restore-database.sh backup_file.sql.gz        # Use specific file
./scripts/restore-database.sh backup_file.sql.gz --confirm  # Skip confirmation
```

### `setup-backup-cron.sh`
Manages automated backup scheduling.
```bash
./scripts/setup-backup-cron.sh install    # Install hourly backups
./scripts/setup-backup-cron.sh uninstall  # Remove automation
./scripts/setup-backup-cron.sh status     # Show current status
./scripts/setup-backup-cron.sh test       # Test backup script
```

### `configure-backup-frequency.sh`
Changes backup frequency.
```bash
./scripts/configure-backup-frequency.sh hourly   # Every hour
./scripts/configure-backup-frequency.sh daily    # Daily at 2 AM
./scripts/configure-backup-frequency.sh custom   # Custom schedule
```

## Monitoring

### Check if Backups are Running
```bash
tail -f ./backups/cron.log
```

### View Recent Activity
```bash
tail -20 ./backups/backup.log
```

### List Available Backups
```bash
ls -la ./backups/mailservice_backup_*.sql.gz
```

## Recovery Scenarios

### Emergency Recovery
If you need to restore immediately:
```bash
./scripts/restore-database.sh --confirm
```

### Selective Recovery
1. List available backups: `./scripts/restore-database.sh` (without args)
2. Choose backup file
3. Restore: `./scripts/restore-database.sh path/to/backup.sql.gz --confirm`

### Verify Backup Integrity
```bash
# Test if backup can be read
zcat ./backups/latest_backup.sql | head -20

# Check backup size (should not be tiny)
ls -lh ./backups/mailservice_backup_*.sql.gz
```

## Security Notes

- Backups contain sensitive data - secure the `./backups/` directory
- Database credentials are read from `.env` file
- Consider encrypting backups for long-term storage
- Regularly test restore procedures

## Troubleshooting

### Backup Not Running
```bash
# Check cron status
crontab -l | grep backup

# Check logs
tail -20 ./backups/cron.log

# Test manually
./scripts/backup-database.sh --force
```

### Permission Issues
```bash
# Fix script permissions
chmod +x scripts/*.sh

# Check backup directory permissions
ls -la backups/
```

### Database Connection Issues
- Verify `.env` file contains correct `DATABASE_URL`
- Test connection: `mysql -u<user> -p<pass> -h<host> <database> -e "SELECT 1;"`

## Maintenance

The system automatically:
- Removes old backups (keeps last 168)
- Compresses all backups
- Logs all operations
- Only backs up when data changes

For long-term maintenance, consider:
- Archiving old backups to external storage
- Setting up backup verification alerts
- Monitoring disk space usage
- Testing restore procedures monthly

---

## ⚠️ Important Reminder

**This backup system exists because data was lost twice due to accidental database resets. Always verify before running any commands that might affect the database, and always check if backups exist before making destructive changes.**