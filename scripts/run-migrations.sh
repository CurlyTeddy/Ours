#!/bin/bash

# Script to run all Prisma migrations against Turso database
# This script finds all migration.sql files in prisma/migrations and executes them

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if exactly one argument is provided
if [ $# -ne 1 ]; then
    echo -e "${RED}Error: Exactly one argument (database name) is required${NC}"
    echo "Usage: $0 <database-name>"
    echo "Example: $0 ours-dev"
    exit 1
fi

# Database name from command line argument
DB_NAME="$1"

# Check if turso CLI is installed
if ! command -v turso &> /dev/null; then
    echo -e "${RED}Error: turso CLI is not installed or not in PATH${NC}"
    echo "Please install turso CLI first: https://docs.turso.tech/cli/installation"
    exit 1
fi

# Get the script directory to handle relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$PROJECT_ROOT/prisma/migrations"

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}Error: Migrations directory not found at $MIGRATIONS_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}Looking for migration files in: $MIGRATIONS_DIR${NC}"

# Find all migration.sql files and sort them by directory name (timestamp order)
migration_files=()
while IFS= read -r -d '' file; do
    migration_files+=("$file")
done < <(find "$MIGRATIONS_DIR" -name "migration.sql" -type f -print0 | sort)

if [ ${#migration_files[@]} -eq 0 ]; then
    echo -e "${YELLOW}No migration files found in $MIGRATIONS_DIR${NC}"
    exit 0
fi

echo -e "${GREEN}Found ${#migration_files[@]} migration file(s):${NC}"

# Display all migrations that will be run
for file in "${migration_files[@]}"; do
    migration_name=$(basename "$(dirname "$file")")
    echo "  - $migration_name"
done

echo ""
read -p "Do you want to run these migrations against database '$DB_NAME'? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Migration cancelled by user${NC}"
    exit 0
fi

echo -e "${GREEN}Running migrations...${NC}"

# Execute each migration file
for file in "${migration_files[@]}"; do
    migration_name=$(basename "$(dirname "$file")")
    echo -e "${YELLOW}Executing migration: $migration_name${NC}"
    
    # Check if file is readable
    if [ ! -r "$file" ]; then
        echo -e "${RED}Error: Cannot read migration file: $file${NC}"
        exit 1
    fi
    
    # Execute the migration using turso db shell
    if turso db shell "$DB_NAME" < "$file"; then
        echo -e "${GREEN}✓ Migration $migration_name completed successfully${NC}"
    else
        echo -e "${RED}✗ Migration $migration_name failed${NC}"
        exit 1
    fi
    
    echo ""
done

echo -e "${GREEN}All migrations completed successfully!${NC}"