# Konfigurasi Server Lokal

## Quick Start

```bash
# 1. Start Docker containers
docker-compose up -d

# 2. Start auth server (terminal terpisah)
cd scripts/auth-server && node server.js

# 3. Start frontend
npm run dev
```

Buka: **http://localhost:8080**

---

## Docker Containers

| Container | Port | Fungsi |
|-----------|------|--------|
| `aquvit-postgres` | 5433 | PostgreSQL Database |
| `postgrest-local` | 3001 | PostgREST API |

### Commands

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Restart PostgREST saja
docker restart postgrest-local

# Lihat logs
docker logs -f postgrest-local
docker logs -f aquvit-postgres
```

---

## Database Credentials

| Item | Value |
|------|-------|
| Host | `localhost` |
| Port | `5433` |
| Database | `aquvit_test` |
| User | `postgres` |
| Password | `postgres` |

### Connect via psql

```bash
docker exec -it aquvit-postgres psql -U postgres -d aquvit_test
```

---

## JWT Secret

PostgREST JWT Secret (dari docker-compose.yml):
```
reallyreallyreallyreallyverysafeandsecurejwtsecret
```

Anon JWT Token (sudah di-generate, expire 100 tahun):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImF1ZCI6ImFub24iLCJpYXQiOjE3Njc1MzE0ODUsImV4cCI6NDkyMTEzMTQ4NX0.5fqX3eXr6VhW2vGWUUlHQxPO_ATFsJxyX6zJXqMduxs
```

---

## Konfigurasi client.ts

File: `src/integrations/supabase/client.ts`

### Untuk Local Database

```typescript
// getBaseUrl() return:
return 'http://localhost:3001';

// getAnonJWT() return LOCAL_ANON_JWT untuk localhost
```

### Untuk VPS Manokwari

```typescript
// getBaseUrl() return:
return 'https://mkw.aquvit.id';

// getAnonJWT() return PROD_ANON_JWT
```

### Untuk VPS Nabire

```typescript
// getBaseUrl() return:
return 'https://nbx.aquvit.id';

// getAnonJWT() return PROD_ANON_JWT
```

---

## Restore Database dari VPS

### 1. Dump dari VPS

```bash
ssh -i Aquvit.pem deployer@103.197.190.54 "sudo -u postgres pg_dump -d mkw_db --no-owner --no-acl" > mkw_db_backup.sql
```

### 2. Restore ke Local

```bash
# Stop PostgREST
docker stop postgrest-local

# Drop & Create database
docker exec aquvit-postgres psql -U postgres -c "DROP DATABASE IF EXISTS aquvit_test;"
docker exec aquvit-postgres psql -U postgres -c "CREATE DATABASE aquvit_test;"

# Restore (via PowerShell)
powershell -Command "Get-Content 'mkw_db_backup.sql' -Raw | docker exec -i aquvit-postgres psql -U postgres -d aquvit_test"

# Create roles
docker exec aquvit-postgres psql -U postgres -d aquvit_test -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'owner') THEN CREATE ROLE owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin') THEN CREATE ROLE admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cashier') THEN CREATE ROLE cashier NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supir') THEN CREATE ROLE supir NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sales') THEN CREATE ROLE sales NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supervisor') THEN CREATE ROLE supervisor NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'designer') THEN CREATE ROLE designer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operator') THEN CREATE ROLE operator NOLOGIN; END IF;
END
\$\$;

GRANT authenticated TO owner, admin, cashier, supir, sales, supervisor, designer, operator;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
"

# Start PostgREST
docker start postgrest-local
```

---

## Test API

```bash
# Test dengan curl
curl -s "http://localhost:3001/company_settings?select=key,value&limit=3" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImF1ZCI6ImFub24iLCJpYXQiOjE3Njc1MzE0ODUsImV4cCI6NDkyMTEzMTQ4NX0.5fqX3eXr6VhW2vGWUUlHQxPO_ATFsJxyX6zJXqMduxs"
```

---

## Troubleshooting

### Error: JWT decode failed
- Pastikan `LOCAL_ANON_JWT` di client.ts sesuai dengan JWT secret di docker-compose.yml

### Error: Connection refused port 3001
- Jalankan `docker-compose up -d`

### Error: Database not exist
- Jalankan restore database dari VPS

### Error: Role does not exist
- Jalankan script create roles di atas

### PostgREST tidak reload schema
```bash
docker restart postgrest-local
```
