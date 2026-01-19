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

# Start supervisord (manages Next.js + AKTools)
echo "Starting services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
