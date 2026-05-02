#!/bin/bash
set -e

# Apply Prisma migrations if DATABASE_URL is set (database mode).
# For an existing database that pre-dates the migrations directory, run once:
#   prisma migrate resolve --applied 20260502000000_init
#   prisma migrate resolve --applied 20260502000001_rename_datasource_ids
# to mark the baseline as already applied. See docker/README.md for details.
if [ -n "$DATABASE_URL" ]; then
    echo "Applying database migrations..."
    prisma migrate deploy --schema=/app/prisma/schema.prisma
    echo "Database migrations applied"
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
