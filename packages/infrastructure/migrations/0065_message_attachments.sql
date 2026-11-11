CREATE TABLE "message_attachments" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "message_attachments_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE INDEX "message_attachments_page_idx" ON "message_attachments" USING btree ("organization_id","conversation_id","created_at","message_id");--> statement-breakpoint
CREATE INDEX "message_attachments_uploader_fk_idx" ON "message_attachments" USING btree ("organization_id","uploader_id");