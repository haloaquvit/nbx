-- Membuat tipe data baru untuk status absensi
CREATE TYPE attendance_status AS ENUM ('Hadir', 'Pulang');

-- Membuat tabel untuk menyimpan catatan absensi
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  status attendance_status NOT NULL,
  location_check_in TEXT,
  location_check_out TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mengaktifkan Row Level Security
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Kebijakan: Pengguna hanya bisa memasukkan data absensi untuk dirinya sendiri
CREATE POLICY "Users can insert their own attendance"
ON public.attendance FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Kebijakan: Pengguna hanya bisa melihat data absensinya sendiri
CREATE POLICY "Users can view their own attendance"
ON public.attendance FOR SELECT
USING (auth.uid() = user_id);

-- Kebijakan: Pengguna hanya bisa mengupdate data absensinya sendiri (untuk clock-out)
CREATE POLICY "Users can update their own attendance"
ON public.attendance FOR UPDATE
USING (auth.uid() = user_id);

-- Kebijakan: Admin/Owner bisa melihat semua data absensi
CREATE POLICY "Admins and owners can view all attendance"
ON public.attendance FOR SELECT
USING (get_current_user_role() IN ('admin', 'owner'));