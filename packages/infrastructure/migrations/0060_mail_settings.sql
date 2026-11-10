CREATE TABLE "mail_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"secure" boolean NOT NULL,
	"username" text,
	"password_ciphertext" text,
	"from_address" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"updated_by" uuid NOT NULL
);
