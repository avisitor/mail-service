#!/bin/bash

# Setup script for mail-service systemd service
# Run this script as root to install the service

set -e

SERVICE_NAME="mail-service"
SERVICE_FILE="/var/www/html/mail-service/mail-service.service"
SYSTEMD_DIR="/etc/systemd/system"
WORKING_DIR="/var/www/html/mail-service"

echo "Setting up $SERVICE_NAME systemd service..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Check if service file exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo "Error: Service file not found at $SERVICE_FILE"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if the application directory exists
if [ ! -d "$WORKING_DIR" ]; then
    echo "Error: Working directory $WORKING_DIR does not exist"
    exit 1
fi

# Check if the built application exists
if [ ! -f "$WORKING_DIR/dist/src/server.js" ]; then
    echo "Warning: Built application not found at $WORKING_DIR/dist/src/server.js"
    echo "Make sure to build the application with: npm run build"
fi

# Create necessary directories
echo "Creating log directories..."
mkdir -p "$WORKING_DIR/logs"
chown apache:web-dev "$WORKING_DIR/logs"
chmod 755 "$WORKING_DIR/logs"

# Create system log directory
mkdir -p "/var/log/mail-service"
chown apache:web-dev "/var/log/mail-service"
chmod 755 "/var/log/mail-service"

# Install logrotate configuration
echo "Installing logrotate configuration..."
if [ -f "$WORKING_DIR/mail-service.logrotate" ]; then
    cp "$WORKING_DIR/mail-service.logrotate" "/etc/logrotate.d/mail-service"
    chmod 644 "/etc/logrotate.d/mail-service"
    echo "Logrotate configuration installed"
else
    echo "Warning: Logrotate configuration file not found"
fi

# Copy service file to systemd directory
echo "Installing service file..."
cp "$SERVICE_FILE" "$SYSTEMD_DIR/$SERVICE_NAME.service"
chmod 644 "$SYSTEMD_DIR/$SERVICE_NAME.service"

# Reload systemd daemon
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable the service
echo "Enabling $SERVICE_NAME service..."
systemctl enable "$SERVICE_NAME"

echo ""
echo "✅ $SERVICE_NAME service has been installed and enabled!"
echo ""
echo "Log file location: /var/log/mail-service/mail-service.log"
echo ""
echo "Available commands:"
echo "  systemctl start $SERVICE_NAME     # Start the service"
echo "  systemctl stop $SERVICE_NAME      # Stop the service"
echo "  systemctl restart $SERVICE_NAME   # Restart the service"
echo "  systemctl status $SERVICE_NAME    # Check service status"
echo "  systemctl enable $SERVICE_NAME    # Enable auto-start on boot"
echo "  systemctl disable $SERVICE_NAME   # Disable auto-start on boot"
echo ""
echo "View logs:"
echo "  tail -f /var/log/mail-service/mail-service.log    # Live application logs"
echo "  tail -n 50 /var/log/mail-service/mail-service.log # Recent application logs"
echo "  journalctl -u $SERVICE_NAME -f                    # Live system logs"
echo "  journalctl -u $SERVICE_NAME                       # System logs"
echo ""
echo "Or use the convenience script:"
echo "  ./service.sh logs-live    # Live application logs"
echo "  ./service.sh logs         # Recent application logs"
echo "  ./service.sh status       # Service status"
echo ""
echo "To start the service now, run:"
echo "  systemctl start $SERVICE_NAME"
echo "  # or: ./service.sh start"