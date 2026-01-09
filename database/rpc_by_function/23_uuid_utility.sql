-- =====================================================
-- 23 UUID UTILITY
-- Generated: 2026-01-09T00:29:07.867Z
-- Total functions: 10
-- =====================================================

-- Functions in this file:
--   uuid_generate_v1
--   uuid_generate_v1mc
--   uuid_generate_v3
--   uuid_generate_v4
--   uuid_generate_v5
--   uuid_nil
--   uuid_ns_dns
--   uuid_ns_oid
--   uuid_ns_url
--   uuid_ns_x500

-- =====================================================
-- Function: uuid_generate_v1
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$
;


-- =====================================================
-- Function: uuid_generate_v1mc
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$
;


-- =====================================================
-- Function: uuid_generate_v3
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$
;


-- =====================================================
-- Function: uuid_generate_v4
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$
;


-- =====================================================
-- Function: uuid_generate_v5
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$
;


-- =====================================================
-- Function: uuid_nil
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$
;


-- =====================================================
-- Function: uuid_ns_dns
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$
;


-- =====================================================
-- Function: uuid_ns_oid
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$
;


-- =====================================================
-- Function: uuid_ns_url
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$
;


-- =====================================================
-- Function: uuid_ns_x500
-- =====================================================
CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$
;


