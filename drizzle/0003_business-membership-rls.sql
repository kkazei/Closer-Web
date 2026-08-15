-- Custom SQL migration file, put your code below! --
-- TASK-RLS-004: make business memberships readable only within an
-- authenticated user's existing business tenant. Membership writes remain
-- unavailable to ordinary client requests until a controlled operation is
-- designed and implemented.

ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Preserve least privilege explicitly: authenticated may select through RLS,
-- while anon and authenticated have no membership DML privileges.
REVOKE ALL PRIVILEGES
  ON TABLE public.business_memberships
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT
  ON TABLE public.business_memberships
  TO authenticated;--> statement-breakpoint

-- The security-definer helper avoids recursive policy evaluation while
-- checking the caller's existing membership for the target business.
CREATE POLICY business_memberships_select_members
  ON public.business_memberships
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (private.is_business_member(business_id));
