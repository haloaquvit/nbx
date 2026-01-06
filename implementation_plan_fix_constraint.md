# Implementation Plan - Fix Journal Reference Type Constraint

The user is still experiencing the "journal_entries_reference_type_check" error when processing production. Despite previous attempts to update the constraint, it appears the change might not have been applied correctly or there is some permission/environment issue.

## Proposed Changes

### 1. Database Verification & Cleanup
- Use `sudo -u postgres` to access the databases for maximum permissions.
- Explicitly check the definition of the constraint in both `aquvit_new` and `mkw_db`.
- Check if there are multiple constraints on the `reference_type` column.
- Verify if there are other schemas containing `journal_entries`.

### 2. Force Constraint Refresh
- Create a script to DROP the constraint if it exists.
- Re-create the constraint with a comprehensive list of allowed values, including 'production'.
- Manually test an INSERT statement via `psql` to verify the constraint is working as expected.

### 3. Service Restart
- Restart PostgREST services to ensure they reload the schema information from the database.

## Verification Plan

### Automated Tests
- Run a SQL script that attempts to insert a dummy record with `reference_type = 'production'`.
- Verify the insert succeeds.
- Roll back the test insert.

### Manual Verification
- Request the user to try the "Proses Produksi" button again in the application.
