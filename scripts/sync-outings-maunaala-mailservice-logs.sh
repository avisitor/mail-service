#!/bin/bash
# Sync maillog/smslog from nightly DB dumps into mailservice.
#
# Expects /tmp/outingsdump.sql.gz and /tmp/maunaaladump.sql.gz
# (created by nightly cron on the outings app server and copied here).
#
# Runs on the mailservice host alongside the IDP.

cd /var/www/html/mail-service/scripts

OUTPUT=$(php sync-outings-maunaala-mailservice-logs.php 2>&1)
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
    SUBJECT='ERROR: Sync mail/sms logs to mail-service'
else
    TOTAL_CHANGES=$(echo "$OUTPUT" | grep -oE '(inserted|skipped)=[0-9]+' | grep -oE '[0-9]+' | awk '{sum+=$1} END {print sum+0}')
    if [ "$TOTAL_CHANGES" -eq 0 ]; then
        SUBJECT='Sync mail/sms logs to mail-service: no changes'
    else
        SUBJECT="Sync mail/sms logs to mail-service: ${TOTAL_CHANGES} change(s)"
    fi
fi

echo "$OUTPUT" | mail -r test@worldspot.com -s "$SUBJECT" test@worldspot.com
