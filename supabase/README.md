# Supabase

This folder only contains the database source of truth for PiScrow.

## Keep

- `schema.sql`: current schema snapshot
- `migrations/`: ordered migration history

## Rule

If the database changes, update the migration history and keep `schema.sql` aligned with it.
