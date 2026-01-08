#!/bin/bash
PGPASSWORD=Aquvit2024 psql -U aquavit -h 127.0.0.1 -d aquvit_new -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
