#!/bin/bash
# El Templo - Database Restore from Backup
# Usage: ./restore.sh /var/backups/mysql/eltemplo_20260214_060000.sql.gz
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -la ${BACKUP_DIR:-/var/backups/mysql}/eltemplo_*.sql.gz 2>/dev/null || echo "No backups found"
  exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${DB_NAME:-eltemplo}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD must be set}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will REPLACE the current '$DB_NAME' database with the backup."
echo "Backup file: $BACKUP_FILE"
echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

echo "[$(date)] Restoring database from: $BACKUP_FILE"

# Restore: decompress and pipe to mysql
gunzip -c "$BACKUP_FILE" | mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"

echo "[$(date)] Restore complete. Restart the API to pick up any changes."
echo "Run: pm2 restart eltemplo-api"
