#!/bin/bash

# Database restore script for Eirvana
# Restores a backup to the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="./backups"
CONTAINER_NAME="eirvana-database"
DB_NAME="${POSTGRES_DB:-eirvana}"
DB_USER="${POSTGRES_USER:-eirvana}"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file>"
    echo "Available backups:"
    ls -la "${BACKUP_DIR}"/eirvana_backup_*.sql.gz 2>/dev/null || echo "No backups found in ${BACKUP_DIR}"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file '${BACKUP_FILE}' not found"
    exit 1
fi

echo "Restoring database from backup: ${BACKUP_FILE}"

# Check if container is running
if ! docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Database container '${CONTAINER_NAME}' is not running"
    echo "Please start the database with: docker-compose up db"
    exit 1
fi

# Confirm restore operation
echo "WARNING: This will overwrite the current database!"
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 1
fi

# Determine if file is compressed
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    echo "Decompressing and restoring backup..."
    gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}"
else
    echo "Restoring backup..."
    cat "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}"
fi

echo "Database restore completed successfully!"