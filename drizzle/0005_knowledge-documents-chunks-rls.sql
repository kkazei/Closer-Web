-- Custom SQL migration file, put your code below! --
-- TASK-RLS-006: protect tenant-owned knowledge documents and chunks.
-- Documents are managed by business owners/admins; chunks are read-only to
-- ordinary authenticated clients and remain a trusted ingestion concern.

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Documents: all business members may read. Owners/admins may create and
-- update document metadata/lifecycle fields. There is intentionally no
-- authenticated DELETE policy.
REVOKE ALL PRIVILEGES
  ON TABLE public.knowledge_documents
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT
  ON TABLE public.knowledge_documents
  TO authenticated;--> statement-breakpoint
GRANT INSERT (
  business_id,
  created_by_profile_id,
  name,
  document_type,
  source_uri,
  status,
  metadata
)
  ON TABLE public.knowledge_documents
  TO authenticated;--> statement-breakpoint
GRANT UPDATE (
  name,
  document_type,
  source_uri,
  status,
  metadata,
  updated_at
)
  ON TABLE public.knowledge_documents
  TO authenticated;--> statement-breakpoint

CREATE POLICY knowledge_documents_select_members
  ON public.knowledge_documents
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (private.is_business_member(business_id));--> statement-breakpoint

CREATE POLICY knowledge_documents_insert_managers
  ON public.knowledge_documents
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_business_role(
      business_id,
      ARRAY['owner', 'admin']::public.membership_role[]
    )
    AND created_by_profile_id = (SELECT auth.uid())
  );--> statement-breakpoint

CREATE POLICY knowledge_documents_update_managers
  ON public.knowledge_documents
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    private.has_business_role(
      business_id,
      ARRAY['owner', 'admin']::public.membership_role[]
    )
  )
  WITH CHECK (
    private.has_business_role(
      business_id,
      ARRAY['owner', 'admin']::public.membership_role[]
    )
  );--> statement-breakpoint

-- Chunks: members may read only chunks in businesses they belong to. No
-- ordinary client INSERT/UPDATE/DELETE path is granted. The existing
-- composite document foreign key remains the parent-tenant safeguard.
REVOKE ALL PRIVILEGES
  ON TABLE public.document_chunks
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT
  ON TABLE public.document_chunks
  TO authenticated;--> statement-breakpoint

CREATE POLICY document_chunks_select_members
  ON public.document_chunks
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (private.is_business_member(business_id));
