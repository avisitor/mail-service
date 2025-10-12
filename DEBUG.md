# Debug Logging Configuration

The mail service now has conditional debug logging that can be controlled via environment variables.

## Environment Variables

### DEBUG_TEMPLATES
Controls template variable substitution debugging in `src/utils/templates.ts`
- Set to `'true'` to enable template processing debug logs
- Automatically enabled when `NODE_ENV=development`

### DEBUG_WORKER
Controls worker service debugging in `src/modules/worker/service.ts`
- Set to `'true'` to enable email job processing debug logs
- Automatically enabled when `NODE_ENV=development`

## Usage Examples

### Enable Template Debugging Only
```bash
sudo systemctl stop mail-service
sudo bash -c 'echo "DEBUG_TEMPLATES=true" >> /etc/systemd/system/mail-service.service.d/override.conf'
sudo systemctl daemon-reload
sudo systemctl start mail-service
```

### Enable Worker Debugging Only
```bash
sudo systemctl stop mail-service
sudo bash -c 'echo "DEBUG_WORKER=true" >> /etc/systemd/system/mail-service.service.d/override.conf'
sudo systemctl daemon-reload
sudo systemctl start mail-service
```

### Enable All Debugging
```bash
sudo systemctl stop mail-service
sudo bash -c 'echo "DEBUG_TEMPLATES=true" >> /etc/systemd/system/mail-service.service.d/override.conf'
sudo bash -c 'echo "DEBUG_WORKER=true" >> /etc/systemd/system/mail-service.service.d/override.conf'
sudo systemctl daemon-reload
sudo systemctl start mail-service
```

### Disable All Debugging
```bash
sudo systemctl stop mail-service
# Edit or remove the environment variables from the service config
sudo systemctl daemon-reload
sudo systemctl start mail-service
```

## Debug Log Examples

### Template Processing (DEBUG_TEMPLATES=true)
```
[substituteTemplateVariables] Input: { content: "Subject: ${sender name} has sent...", recipientContext: {...} }
[substituteTemplateVariables] Flat context: { email: "test@example.com", name: "John", sender_name: "Alice", ... }
[substituteTemplateVariables] Processing variable: sender name
[substituteTemplateVariables] Found match: { key: "sender_name", value: "Alice" }
[substituteTemplateVariables] Replacing: { fullMatch: "${sender name}", value: "Alice" }
[processEmailTemplate] Called with: { subject: "Meeting Invite", recipientContext: {...} }
```

### Worker Processing (DEBUG_WORKER=true)
```
[Worker] Sending email to user@example.com: { subject: "Meeting Invite", hasHtml: true, isTestEmail: false }
[Worker] Email delivery result for job abc123: { messageId: "msg456", status: "sent", accepted: ["user@example.com"] }
[createEmailJobs] Creating jobs: { groupId: "grp789", recipientCount: 2, recipients: [...] }
[createEmailJobs] Created 2 jobs with IDs: ["job1", "job2"]
```

## Viewing Logs
```bash
# View real-time logs
tail -f /var/log/mail-service/mail-service.log

# View recent logs
tail -50 /var/log/mail-service/mail-service.log

# Search for specific debug messages
grep "substituteTemplateVariables" /var/log/mail-service/mail-service.log
grep "createEmailJobs" /var/log/mail-service/mail-service.log
```

## Notes
- Debug logs are only generated when the respective environment variables are set
- Production deployments should not enable debug logging unless troubleshooting
- Debug logs include detailed recipient context and template processing data
- Logs are written to `/var/log/mail-service/mail-service.log`