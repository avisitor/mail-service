# Mail Service - Systemd Service Setup

This document explains how to set up the mail-service as a systemd service on CentOS/RHEL systems, allowing it to be managed with `systemctl` commands.

## Quick Start

1. **Install the service:**
   ```bash
   sudo ./setup-service.sh
   ```

2. **Start the service:**
   ```bash
   sudo systemctl start mail-service
   # or use the convenience script:
   ./service.sh start
   ```

3. **Check status:**
   ```bash
   systemctl status mail-service
   # or:
   ./service.sh status
   ```

## Files Created

- `mail-service.service` - Systemd service configuration
- `setup-service.sh` - Installation script (run as root)
- `service.sh` - Convenience management script
- `SERVICE-SETUP.md` - This documentation

## Service Configuration

The service is configured with the following settings:

- **User/Group**: `apache:web-dev` (web server user for file permissions)
- **Working Directory**: `/var/www/html/mail-service`
- **Port**: 3100 (configurable via environment)
- **Auto-restart**: Yes (10-second delay)
- **Security**: Hardened with restricted permissions
- **Resource Limits**: 512MB memory limit, 65536 file handles

## Management Commands

### Using systemctl directly:
```bash
sudo systemctl start mail-service      # Start service
sudo systemctl stop mail-service       # Stop service  
sudo systemctl restart mail-service    # Restart service
sudo systemctl enable mail-service     # Enable auto-start on boot
sudo systemctl disable mail-service    # Disable auto-start
systemctl status mail-service          # Check status
journalctl -u mail-service -f          # View live logs
```

### Using the convenience script:
```bash
./service.sh start          # Start service
./service.sh stop           # Stop service
./service.sh restart        # Restart service
./service.sh status         # Check status
./service.sh logs           # View recent application logs
./service.sh logs-live      # View live application logs
./service.sh logs-system    # View recent system logs
./service.sh logs-system-live # View live system logs
./service.sh enable         # Enable auto-start
./service.sh disable        # Disable auto-start
./service.sh install        # Install service (requires sudo)
./service.sh help           # Show help
```

## Prerequisites

Before installing the service, ensure:

1. **Node.js is installed**:
   ```bash
   node --version  # Should show v18+ or v20+
   ```

2. **Application is built**:
   ```bash
   npm run build
   # This creates the dist/ directory with compiled TypeScript
   ```

3. **Dependencies are installed**:
   ```bash
   npm install --production
   ```

4. **Environment configured**:
   - Copy `.env.example` to `.env`
   - Configure database, SMTP, and other settings

## Environment Variables

The service runs with these environment variables:

- `NODE_ENV=production`
- `PORT=3100` 
- `LOG_LEVEL=info`

Additional environment variables should be configured in your `.env` file in the working directory.

## Logs and Monitoring

### View logs:
```bash
# View the main log file
tail -f /var/log/mail-service/mail-service.log

# Recent logs from log file
tail -n 50 /var/log/mail-service/mail-service.log

# Search logs
grep "ERROR" /var/log/mail-service/mail-service.log

# System service logs via journalctl
journalctl -u mail-service -n 50

# Live system logs (follow)
journalctl -u mail-service -f

# Logs with timestamps
journalctl -u mail-service --since "1 hour ago"
```

### Log locations:
- **Main log file**: `/var/log/mail-service/mail-service.log` (stdout/stderr)
- **System logs**: Available via `journalctl` for service status
- **Application logs**: `/var/www/html/mail-service/logs/` (if configured by app)
- **Error logs**: Written to `/var/log/mail-service/mail-service.log`

## Security Features

The service includes security hardening:

- **NoNewPrivileges**: Prevents privilege escalation
- **PrivateTmp**: Private /tmp directory
- **ProtectSystem**: Read-only system directories
- **ProtectHome**: No access to user home directories
- **ReadWritePaths**: Limited write access to logs and uploads only

## Troubleshooting

### Service won't start:
```bash
# Check service status
systemctl status mail-service

# Check recent logs
journalctl -u mail-service -n 20

# Check if Node.js app runs manually
cd /var/www/html/mail-service
node dist/src/server.js
```

### Common issues:

1. **Built application missing**: Run `npm run build`
2. **Permission issues**: Check file ownership (`chown apache:web-dev`)
3. **Port conflicts**: Ensure port 3100 is available
4. **Database connection**: Verify database configuration in `.env`
5. **Dependencies missing**: Run `npm install --production`

### Rebuild and restart:
```bash
# Build application
npm run build

# Test manually first
node dist/src/server.js

# Restart service
./service.sh restart

# Check status
./service.sh status
```

## Uninstalling

To remove the service:

```bash
# Stop and disable service
sudo systemctl stop mail-service
sudo systemctl disable mail-service

# Remove service file
sudo rm /etc/systemd/system/mail-service.service

# Reload systemd
sudo systemctl daemon-reload
```

## Development vs Production

For development, you can still run the service directly:
```bash
npm run dev
```

For production, use the systemd service for:
- Automatic startup on server reboot
- Process monitoring and restart
- Centralized logging
- Resource management
- Security isolation

## File Permissions

The service runs as the `apache` user, so ensure proper permissions:

```bash
# Set ownership for the application directory
sudo chown -R apache:web-dev /var/www/html/mail-service

# Ensure logs directory is writable
sudo chmod 755 /var/www/html/mail-service/logs
```