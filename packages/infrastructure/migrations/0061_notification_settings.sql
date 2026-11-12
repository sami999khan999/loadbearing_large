CREATE TABLE "notification_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"digest_hour" smallint NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "notification_settings_hour_ck" CHECK ("notification_settings"."digest_hour" between 0 and 23)
);
