ALTER TABLE "messages" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "parent_created_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("organization_id","conversation_id","parent_id","created_at","id") WHERE "messages"."parent_id" is not null;