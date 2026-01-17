#!/bin/bash
set -e

# Run Prisma migrations if DATABASE_URL is set (database mode)
if [ -n "$DATABASE_URL" ]; then
    echo "Running database migrations..."
    prisma migrate deploy --schema=/app/prisma/schema.prisma
    echo "Database migrations complete"
fi

# Start supervisord (manages Next.js + AKTools)
echo "Starting services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
