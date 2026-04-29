
-- 1. role_assignments table
CREATE TABLE public.role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  staff_email text,
  staff_name text,
  previous_role app_role,
  assigned_role app_role NOT NULL,
  assignment_type text NOT NULL DEFAULT 'permanent',
  duration_hours integer,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  reverted_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  assigned_by uuid,
  assigned_by_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX role_assignments_restaurant_idx ON public.role_assignments(restaurant_id);
CREATE INDEX role_assignments_user_idx ON public.role_assignments(user_id);
CREATE INDEX role_assignments_active_idx ON public.role_assignments(status, expires_at) WHERE status = 'active';

ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant admins manage their role assignments"
  ON public.role_assignments
  FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'restaurant_admin'::app_role) AND restaurant_id = get_user_restaurant_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Staff can view own assignments"
  ON public.role_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.role_assignments;
ALTER TABLE public.role_assignments REPLICA IDENTITY FULL;

-- 2. Allow service role to insert system_logs (edge function uses service role which bypasses RLS,
-- but ensure no existing block beyond the FALSE insert policy that only blocks anon/authenticated).
-- system_logs already has "Deny direct inserts" for non-service. Service role bypasses RLS, so no change needed.

-- 3. expire_temporary_roles() function
CREATE OR REPLACE FUNCTION public.expire_temporary_roles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM public.role_assignments
    WHERE status = 'active'
      AND assignment_type = 'temporary'
      AND expires_at IS NOT NULL
      AND expires_at < now()
  LOOP
    -- Revert user_roles to previous_role (or remove if null)
    IF rec.previous_role IS NOT NULL THEN
      UPDATE public.user_roles
      SET role = rec.previous_role
      WHERE user_id = rec.user_id
        AND restaurant_id = rec.restaurant_id;
    END IF;

    UPDATE public.role_assignments
    SET status = 'expired', reverted_at = now()
    WHERE id = rec.id;

    INSERT INTO public.system_logs(actor_id, actor_email, action, entity_type, entity_id, details)
    VALUES (
      NULL, 'system',
      'staff.role_auto_reverted',
      'staff', rec.user_id::text,
      jsonb_build_object(
        'restaurant_id', rec.restaurant_id,
        'staff_email', rec.staff_email,
        'staff_name', rec.staff_name,
        'from_role', rec.assigned_role,
        'to_role', rec.previous_role,
        'assignment_id', rec.id,
        'expired_at', rec.expires_at
      )
    );
  END LOOP;
END;
$$;

-- 4. Helper RPC callable from anon/authenticated (safe – just runs the expiry sweep)
GRANT EXECUTE ON FUNCTION public.expire_temporary_roles() TO authenticated, anon;

-- 5. pg_cron schedule (every 5 minutes)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-temporary-roles') THEN
    PERFORM cron.schedule(
      'expire-temporary-roles',
      '*/5 * * * *',
      $cron$ SELECT public.expire_temporary_roles(); $cron$
    );
  END IF;
END $$;
