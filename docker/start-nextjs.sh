#!/bin/bash
# Wrapper script to start Next.js after AKTools is ready

wait_for_aktools() {
    local max_attempts=60
    local attempt=1
    local aktools_url="${NEXT_PUBLIC_AKTOOLS_API_URL:-http://127.0.0.1:8080}"

    echo "Waiting for AKTools to be ready at ${aktools_url}..."

    while [ $attempt -le $max_attempts ]; do
        # Check if aktools responds (any response is good, including errors)
        if curl -s --connect-timeout 2 "${aktools_url}/api/public/stock_info_a_code_name" > /dev/null 2>&1; then
            echo "AKTools is ready!"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts: AKTools not ready yet, waiting 2s..."
        sleep 2
        attempt=$((attempt + 1))
    done

    echo "Warning: AKTools did not become ready within timeout (120s), starting Next.js anyway..."
    return 0
}

# Wait for AKTools
wait_for_aktools

# Start Next.js
echo "Starting Next.js server..."
exec node /app/server.js
