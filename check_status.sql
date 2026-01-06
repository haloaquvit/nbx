
\echo '=== EXTENSIONS ==='
SELECT extname, extversion FROM pg_extension;
\echo '=== TABLES ==='
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
\echo '=== FUNCTIONS ==='
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' ORDER BY routine_name;
