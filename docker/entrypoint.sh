#!/bin/bash
set -e

# Run Prisma migrations if DATABASE_URL is set (database mode)
if [ -n "$DATABASE_URL" ]; then
    echo "Syncing database schema..."

    # Use db push for development - more forgiving, doesn't require migration history
    # For production with strict migration control, use: prisma migrate deploy
    prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss=false --skip-generate

    echo "Database schema sync complete"
fi

# Set up cron job for daily dataset updates at 6 PM Beijing time (10:00 UTC)
echo "Setting up scheduled dataset update cron job..."

# Create cron job file with environment variables
cat > /etc/cron.d/update-datasets << EOF
# Dataset update - runs daily at 6 PM Beijing time (10:00 UTC)
CRON_SECRET=${CRON_SECRET}
0 10 * * * root /app/update-datasets.sh >> /app/data/cron.log 2>&1
EOF

chmod 0644 /etc/cron.d/update-datasets

# Create log file
touch /app/data/cron-update.log /app/data/cron.log

echo "Cron job configured for 10:00 UTC (18:00 Beijing time)"

# Start supervisord (manages Next.js + AKTools + cron)
echo "Starting services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
