#!/bin/bash

# Database backup script for Eirvana
# Creates timestamped backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="./backups"
CONTAINER_NAME="eirvana-database"
DB_NAME="${POSTGRES_DB:-eirvana}"
DB_USER="${POSTGRES_USER:-eirvana}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/eirvana_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

echo "Creating database backup..."
echo "Backup file: ${BACKUP_FILE}"

# Check if container is running
if ! docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Database container '${CONTAINER_NAME}' is not running"
    echo "Please start the database with: docker-compose up db"
    exit 1
fi

# Create the backup
docker exec "${CONTAINER_NAME}" pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --verbose \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists > "${BACKUP_FILE}"

# Compress the backup
gzip "${BACKUP_FILE}"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

echo "Backup completed successfully!"
echo "Compressed backup: ${COMPRESSED_FILE}"
echo "Backup size: $(du -h "${COMPRESSED_FILE}" | cut -f1)"

# Optional: Remove backups older than 30 days
echo "Cleaning up old backups (older than 30 days)..."
find "${BACKUP_DIR}" -name "eirvana_backup_*.sql.gz" -mtime +30 -delete 2>/dev/null || true

echo "Backup process completed!"