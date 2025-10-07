#!/bin/bash

# Mail Service Management Script
# Convenient wrapper for systemctl commands

SERVICE_NAME="mail-service"

show_help() {
    echo "Mail Service Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     Start the mail service"
    echo "  stop      Stop the mail service"
    echo "  restart   Restart the mail service"
    echo "  status    Show service status"
    echo "  logs          Show recent application logs"
    echo "  logs-live     Show live application logs (follow)"
    echo "  logs-system   Show recent system logs"
    echo "  logs-system-live Show live system logs (follow)"
    echo "  enable    Enable auto-start on boot"
    echo "  disable   Disable auto-start on boot"
    echo "  install   Install the systemd service (requires sudo)"
    echo "  help      Show this help message"
    echo ""
}

case "$1" in
    start)
        echo "Starting $SERVICE_NAME..."
        sudo systemctl start "$SERVICE_NAME"
        echo "Service started. Use '$0 status' to check status."
        ;;
    stop)
        echo "Stopping $SERVICE_NAME..."
        sudo systemctl stop "$SERVICE_NAME"
        echo "Service stopped."
        ;;
    restart)
        echo "Restarting $SERVICE_NAME..."
        sudo systemctl restart "$SERVICE_NAME"
        echo "Service restarted. Use '$0 status' to check status."
        ;;
    status)
        systemctl status "$SERVICE_NAME"
        ;;
    logs)
        tail -n 50 /var/log/mail-service/mail-service.log
        ;;
    logs-live)
        echo "Showing live logs for $SERVICE_NAME (Ctrl+C to exit)..."
        tail -f /var/log/mail-service/mail-service.log
        ;;
    logs-system)
        journalctl -u "$SERVICE_NAME" --no-pager -n 50
        ;;
    logs-system-live)
        echo "Showing live system logs for $SERVICE_NAME (Ctrl+C to exit)..."
        journalctl -u "$SERVICE_NAME" -f
        ;;
    enable)
        echo "Enabling $SERVICE_NAME to start on boot..."
        sudo systemctl enable "$SERVICE_NAME"
        echo "Auto-start enabled."
        ;;
    disable)
        echo "Disabling $SERVICE_NAME auto-start on boot..."
        sudo systemctl disable "$SERVICE_NAME"
        echo "Auto-start disabled."
        ;;
    install)
        echo "Installing $SERVICE_NAME systemd service..."
        sudo ./setup-service.sh
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        echo "Error: No command specified."
        echo ""
        show_help
        exit 1
        ;;
    *)
        echo "Error: Unknown command '$1'"
        echo ""
        show_help
        exit 1
        ;;
esac