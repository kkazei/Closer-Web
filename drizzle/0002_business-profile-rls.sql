-- Custom SQL migration file, put your code below! --
-- TASK-RLS-003: protect businesses and profiles for authenticated requests.
-- Membership authorization is delegated to the helpers created by 0001.

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Business rows are readable by members of that business. Only owners and
-- admins may update the mutable business fields. There is intentionally no
-- INSERT or DELETE policy for ordinary authenticated requests.
CREATE POLICY businesses_select_members
  ON public.businesses
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (private.is_business_member(id));--> statement-breakpoint

CREATE POLICY businesses_update_managers
  ON public.businesses
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    private.has_business_role(
      id,
      ARRAY['owner', 'admin']::public.membership_role[]
    )
  )
  WITH CHECK (
    private.has_business_role(
      id,
      ARRAY['owner', 'admin']::public.membership_role[]
    )
  );--> statement-breakpoint

-- Keep the business primary key and timestamps immutable to the
-- authenticated table role. Column privileges make the tenant identity
-- immutable even if an UPDATE policy is satisfied.
REVOKE UPDATE ON TABLE public.businesses FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, slug, archived_at)
  ON TABLE public.businesses
  TO authenticated;--> statement-breakpoint

-- Profiles are self-service records only. The id is both the profile primary
-- key and auth.users.id, so clients may insert only their own id and may not
-- update it. Auth cascade remains responsible for deletion.
CREATE POLICY profiles_select_self
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));--> statement-breakpoint

CREATE POLICY profiles_insert_self
  ON public.profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));--> statement-breakpoint

CREATE POLICY profiles_update_self
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));--> statement-breakpoint

-- Do not expose identity or server-managed timestamp columns to client-side
-- writes. There is intentionally no DELETE policy or DELETE grant.
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;--> statement-breakpoint
GRANT INSERT (id, full_name, avatar_url)
  ON TABLE public.profiles
  TO authenticated;--> statement-breakpoint
GRANT UPDATE (full_name, avatar_url)
  ON TABLE public.profiles
  TO authenticated;
