CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('active', 'completed', 'expired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'processing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'qualifying', 'qualified', 'unqualified');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('completed', 'error');--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "businesses_name_not_blank" CHECK (length(trim("businesses"."name")) > 0),
	CONSTRAINT "businesses_slug_not_blank" CHECK (length(trim("businesses"."slug")) > 0)
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"visitor_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"status" "chat_session_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_business_id_id_unique" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(384),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunks_business_document_index_unique" UNIQUE("business_id","document_id","chunk_index"),
	CONSTRAINT "document_chunks_index_non_negative" CHECK ("document_chunks"."chunk_index" >= 0),
	CONSTRAINT "document_chunks_content_not_blank" CHECK (length(trim("document_chunks"."content")) > 0),
	CONSTRAINT "document_chunks_metadata_object" CHECK (jsonb_typeof("document_chunks"."metadata") = 'object'),
	CONSTRAINT "document_chunks_embedding_model_pair" CHECK (("document_chunks"."embedding" is null and "document_chunks"."embedding_model" is null)
        or ("document_chunks"."embedding" is not null and "document_chunks"."embedding_model" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"created_by_profile_id" uuid,
	"name" text NOT NULL,
	"document_type" text NOT NULL,
	"source_uri" text,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_documents_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "knowledge_documents_name_not_blank" CHECK (length(trim("knowledge_documents"."name")) > 0),
	CONSTRAINT "knowledge_documents_metadata_object" CHECK (jsonb_typeof("knowledge_documents"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"company" text,
	"role" text,
	"company_size" text,
	"use_case" text,
	"budget" text,
	"timeline" text,
	"product_interest" text,
	"buying_intent" text,
	"qualification_status" "lead_status" DEFAULT 'new' NOT NULL,
	"score" smallint,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "leads_score_range" CHECK ("leads"."score" is null or "leads"."score" between 0 and 100),
	CONSTRAINT "leads_score_breakdown_object" CHECK (jsonb_typeof("leads"."score_breakdown") = 'object')
);
--> statement-breakpoint
CREATE TABLE "business_memberships" (
	"business_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_memberships_pkey" PRIMARY KEY("business_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"status" "message_status" DEFAULT 'completed' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"provider" text,
	"model" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_content_not_blank" CHECK (length(trim("messages"."content")) > 0),
	CONSTRAINT "messages_token_counts_non_negative" CHECK (("messages"."input_tokens" is null or "messages"."input_tokens" >= 0)
        and ("messages"."output_tokens" is null or "messages"."output_tokens" >= 0)
        and ("messages"."total_tokens" is null or "messages"."total_tokens" >= 0)),
	CONSTRAINT "messages_metadata_object" CHECK (jsonb_typeof("messages"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_business_lead_fk" FOREIGN KEY ("business_id","lead_id") REFERENCES "public"."leads"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_business_document_fk" FOREIGN KEY ("business_id","document_id") REFERENCES "public"."knowledge_documents"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_profile_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_session_fk" FOREIGN KEY ("business_id","session_id") REFERENCES "public"."chat_sessions"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_business_updated_at_idx" ON "chat_sessions" USING btree ("business_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_sessions_business_lead_idx" ON "chat_sessions" USING btree ("business_id","lead_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_business_status_updated_at_idx" ON "knowledge_documents" USING btree ("business_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_business_created_at_idx" ON "leads" USING btree ("business_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_business_status_created_at_idx" ON "leads" USING btree ("business_id","qualification_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_business_score_idx" ON "leads" USING btree ("business_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "business_memberships_profile_id_idx" ON "business_memberships" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "messages_business_session_created_at_id_idx" ON "messages" USING btree ("business_id","session_id","created_at","id");
