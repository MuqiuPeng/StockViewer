#!/bin/bash
# Daily dataset update script - called by cron at 6 PM Beijing time
# Calls the /api/cron/update-datasets endpoint

LOG_FILE="/app/data/cron-update.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting scheduled dataset update..." >> "$LOG_FILE"

# Wait for the app to be ready
sleep 5

# Call the update API endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/cron/update-datasets)

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract response body (all but last line)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "[$TIMESTAMP] Update completed successfully: $BODY" >> "$LOG_FILE"
else
  echo "[$TIMESTAMP] Update failed with HTTP $HTTP_CODE: $BODY" >> "$LOG_FILE"
fi

echo "[$TIMESTAMP] Update job finished" >> "$LOG_FILE"
