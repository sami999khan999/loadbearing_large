CREATE TABLE "message_reactions" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "message_reactions_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at")
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_once_uq" ON "message_reactions" USING btree ("organization_id","message_id","user_id","emoji","created_at");--> statement-breakpoint
CREATE INDEX "message_reactions_page_idx" ON "message_reactions" USING btree ("organization_id","conversation_id","created_at","message_id");--> statement-breakpoint
CREATE INDEX "message_reactions_user_fk_idx" ON "message_reactions" USING btree ("organization_id","user_id");