CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SCHEMA private FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_business_member(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    target_business_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.business_memberships AS membership
      WHERE membership.business_id = target_business_id
        AND membership.profile_id = auth.uid()
    ),
    false
  );
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.has_business_role(
  target_business_id uuid,
  allowed_roles public.membership_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    target_business_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND COALESCE(cardinality(allowed_roles), 0) > 0
    AND EXISTS (
      SELECT 1
      FROM public.business_memberships AS membership
      WHERE membership.business_id = target_business_id
        AND membership.profile_id = auth.uid()
        AND membership.role = ANY(allowed_roles)
    ),
    false
  );
$function$;--> statement-breakpoint

ALTER FUNCTION private.is_business_member(uuid) OWNER TO postgres;--> statement-breakpoint
ALTER FUNCTION private.has_business_role(uuid, public.membership_role[]) OWNER TO postgres;--> statement-breakpoint

REVOKE ALL PRIVILEGES ON FUNCTION private.is_business_member(uuid)
  FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION private.has_business_role(uuid, public.membership_role[])
  FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.is_business_member(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.has_business_role(uuid, public.membership_role[]) TO authenticated;--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE
  public.businesses,
  public.profiles,
  public.business_memberships,
  public.leads,
  public.chat_sessions,
  public.messages,
  public.knowledge_documents,
  public.document_chunks
  FROM PUBLIC, anon;--> statement-breakpoint

REVOKE ALL PRIVILEGES ON TABLE
  public.businesses,
  public.profiles,
  public.business_memberships,
  public.leads,
  public.chat_sessions,
  public.messages,
  public.knowledge_documents,
  public.document_chunks
  FROM authenticated;--> statement-breakpoint

GRANT SELECT ON TABLE public.businesses TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE public.business_memberships TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.leads TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.chat_sessions TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.knowledge_documents TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE public.document_chunks TO authenticated;
