CREATE TABLE "mail_delivery" (
	"id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"message_id" text,
	"attempts" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_delivery_id_organization_id_created_at_pk" PRIMARY KEY("id","organization_id","created_at"),
	CONSTRAINT "mail_delivery_status_ck" CHECK ("mail_delivery"."status" in ('sent', 'failed')),
	CONSTRAINT "mail_delivery_attempts_ck" CHECK ("mail_delivery"."attempts" >= 0)
) PARTITION BY LIST ("organization_id");
--> statement-breakpoint
CREATE INDEX "mail_delivery_period_idx" ON "mail_delivery" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mail_delivery_recipient_idx" ON "mail_delivery" USING btree ("organization_id","recipient","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mail_delivery_user_fk_idx" ON "mail_delivery" USING btree ("organization_id","user_id");