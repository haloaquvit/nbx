DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.get_current_user_role() IN ('admin', 'owner'))
WITH CHECK (public.get_current_user_role() IN ('admin', 'owner'));