-- =====================================================
-- Migration: Create Companies and Branches System (FIXED)
-- Description: Menambahkan sistem multi-cabang
-- =====================================================

-- 1. Create Companies Table (Perusahaan Induk)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  is_head_office BOOLEAN DEFAULT false,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_id TEXT, -- NPWP
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Create Branches Table (Cabang)
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  manager_id UUID REFERENCES public.profiles(id),
  manager_name TEXT,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb, -- Settings khusus per cabang
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Add branch_id to profiles table IMMEDIATELY
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON public.profiles(branch_id);

-- 4. Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for Companies
DROP POLICY IF EXISTS "Users can view active companies" ON public.companies;
CREATE POLICY "Users can view active companies"
  ON public.companies FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Head office admin can manage companies" ON public.companies;
CREATE POLICY "Head office admin can manage companies"
  ON public.companies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'head_office_admin')
    )
  );

-- 6. Create RLS Policies for Branches
DROP POLICY IF EXISTS "Users can view accessible branches" ON public.branches;
CREATE POLICY "Users can view accessible branches"
  ON public.branches FOR SELECT
  USING (
    -- Super admin dan head office admin bisa lihat semua
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'head_office_admin')
    )
    OR
    -- User biasa hanya bisa lihat branch mereka
    id IN (
      SELECT branch_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin can manage branches" ON public.branches;
CREATE POLICY "Admin can manage branches"
  ON public.branches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'head_office_admin', 'branch_admin')
    )
  );

-- 7. Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_companies_code ON public.companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON public.companies(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_company_id ON public.branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_code ON public.branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_is_active ON public.branches(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON public.branches(manager_id);

-- 8. Create Updated At Trigger for Companies
CREATE OR REPLACE FUNCTION public.update_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_updated_at ON public.companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_companies_updated_at();

-- 9. Create Updated At Trigger for Branches
CREATE OR REPLACE FUNCTION public.update_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS branches_updated_at ON public.branches;
CREATE TRIGGER branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_branches_updated_at();

-- 10. Insert Default Company and Branch for Existing Data
INSERT INTO public.companies (id, name, code, is_head_office, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Aquvit Pusat',
  'HQ',
  true,
  true
) ON CONFLICT (code) DO NOTHING;

INSERT INTO public.branches (id, company_id, name, code, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Kantor Pusat',
  'PUSAT',
  true
) ON CONFLICT (code) DO NOTHING;

-- 11. Update existing profiles to default branch
UPDATE public.profiles
SET branch_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE branch_id IS NULL;

-- 12. Create Helper Functions (NOW branch_id column exists!)

-- Function to get user's branch_id
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT branch_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is head office
CREATE OR REPLACE FUNCTION public.is_head_office_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.branches b ON p.branch_id = b.id
    JOIN public.companies c ON b.company_id = c.id
    WHERE p.id = auth.uid() AND c.is_head_office = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access branch
CREATE OR REPLACE FUNCTION public.can_access_branch(branch_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admin atau head office bisa akses semua
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_admin')
  ) THEN
    RETURN true;
  END IF;

  -- User biasa hanya bisa akses branch mereka
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND branch_id = branch_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.companies IS 'Tabel untuk menyimpan data perusahaan induk';
COMMENT ON TABLE public.branches IS 'Tabel untuk menyimpan data cabang perusahaan';
COMMENT ON FUNCTION public.get_user_branch_id() IS 'Mendapatkan branch_id dari user yang login';
COMMENT ON FUNCTION public.is_head_office_user() IS 'Mengecek apakah user adalah head office';
COMMENT ON FUNCTION public.can_access_branch(UUID) IS 'Mengecek apakah user bisa akses branch tertentu';
