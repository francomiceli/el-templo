#!/bin/bash
# Weekly staging database reset script
# Cron: 0 4 * * 0  (every Sunday at 04:00 UTC / 01:00 Argentina)
#
# Install: crontab -e
#   0 4 * * 0 /opt/el-templo-staging/scripts/reset-staging.sh >> /var/log/el-templo-staging/reset.log 2>&1

set -euo pipefail

# SAFETY: Hardcoded staging database name - NEVER read from env for drop/create
DB_NAME="eltemplo_staging"

# Double-check: refuse to touch production
if [ "$DB_NAME" = "eltemplo" ]; then
    echo "ERROR: Refusing to reset production database"
    exit 1
fi

# Database credentials from environment
STAGING_DB_USER="${STAGING_DB_USER:?STAGING_DB_USER is required}"
STAGING_DB_PASSWORD="${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"

echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') - Resetting staging database..."

# Drop and recreate staging database
echo "Dropping and recreating $DB_NAME..."
mysql -u "$STAGING_DB_USER" -p"$STAGING_DB_PASSWORD" -e "DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;"

# Run migrations
echo "Running migrations..."
cd /opt/el-templo-staging/api && NODE_ENV=production DB_NAME="$DB_NAME" node dist/db/run-migrations.js

# Seed fake data
echo "Seeding fake data..."
NODE_ENV=production DB_NAME="$DB_NAME" node dist/db/seed-staging.js

echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') - Staging reset complete"
