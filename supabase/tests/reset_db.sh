#!/bin/sh
# Recreates a throw-away database "p2test" with a stub of the Supabase auth/storage schemas and all migrations. Needs psql and a running PostgreSQL (PGHOST/PGPORT/PGUSER).
set -e
cd "$(dirname "$0")/../.."
P="psql -X -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists p2test" -c "create database p2test"
$P -d p2test -f supabase/tests/stub.sql
for f in supabase/migrations/*.sql; do $P -d p2test -f "$f" >/dev/null; done
