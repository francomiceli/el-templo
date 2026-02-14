#!/bin/bash
# El Templo - Automated MySQL Backup
# Usage: ./backup.sh
# Cron: 0 6 * * * /path/to/deploy/backup.sh >> /var/log/eltemplo-backup.log 2>&1
# (06:00 UTC = 03:00 Argentina time)
set -euo pipefail

# Configuration (override via environment)
DB_NAME="${DB_NAME:-eltemplo}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mysql}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BUCKET="${BACKUP_BUCKET:-s3://eltemplo-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of database: $DB_NAME"

# Create compressed backup
# --single-transaction: consistent snapshot without locking (InnoDB)
# --quick: retrieve rows one at a time (reduces memory)
# --lock-tables=false: don't lock tables (use single-transaction instead)
mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  --single-transaction --quick --lock-tables=false | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Delete local backups older than retention period
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo "[$(date)] Deleted $DELETED old backups (older than $RETENTION_DAYS days)"

# Upload to cloud storage (S3-compatible, works with Backblaze B2)
if command -v aws &> /dev/null && [ -n "${B2_ENDPOINT_URL:-}" ]; then
  aws s3 cp "$BACKUP_FILE" "${BUCKET}/" --endpoint-url "$B2_ENDPOINT_URL" --quiet
  echo "[$(date)] Uploaded to cloud: ${BUCKET}/$(basename "$BACKUP_FILE")"
else
  echo "[$(date)] Cloud upload skipped (aws CLI or B2_ENDPOINT_URL not configured)"
fi

echo "[$(date)] Backup complete"
