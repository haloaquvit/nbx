-- Create roles table for dynamic role management
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}',
  is_system_role BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Everyone can view active roles" ON public.roles
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins and owners can manage roles" ON public.roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN public.profiles p ON u.id = p.id
      WHERE u.id = auth.uid() 
      AND p.role IN ('admin', 'owner')
    )
  );

-- Insert default system roles
INSERT INTO public.roles (name, display_name, description, permissions, is_system_role, is_active) VALUES
('owner', 'Owner', 'Pemilik perusahaan dengan akses penuh', '{"all": true}', true, true),
('admin', 'Administrator', 'Administrator sistem dengan akses luas', '{"manage_users": true, "manage_products": true, "manage_transactions": true, "view_reports": true}', true, true),
('supervisor', 'Supervisor', 'Supervisor operasional', '{"manage_products": true, "manage_transactions": true, "view_reports": true}', true, true),
('cashier', 'Kasir', 'Kasir untuk transaksi penjualan', '{"create_transactions": true, "manage_customers": true}', true, true),
('designer', 'Desainer', 'Desainer produk dan quotation', '{"create_quotations": true, "manage_products": true}', true, true),
('operator', 'Operator', 'Operator produksi', '{"view_products": true, "update_production": true}', true, true)
ON CONFLICT (name) DO NOTHING;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_active ON public.roles(is_active);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.roles IS 'Table untuk menyimpan role/jabatan yang bisa dikelola secara dinamis';
COMMENT ON COLUMN public.roles.name IS 'Nama unik role (lowercase, untuk sistem)';
COMMENT ON COLUMN public.roles.display_name IS 'Nama tampilan role (untuk UI)';
COMMENT ON COLUMN public.roles.permissions IS 'JSON object berisi permission untuk role ini';
COMMENT ON COLUMN public.roles.is_system_role IS 'Apakah ini system role yang tidak bisa dihapus';
COMMENT ON COLUMN public.roles.is_active IS 'Status aktif role';