CREATE TABLE "worker_queue_settings" (
	"queue" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"autoscale_enabled" boolean DEFAULT false NOT NULL,
	"concurrency_min" smallint DEFAULT 1 NOT NULL,
	"concurrency_max" smallint DEFAULT 1 NOT NULL,
	"scale_up_waiting" integer DEFAULT 50 NOT NULL,
	"step" smallint DEFAULT 1 NOT NULL,
	"scale_down_after_seconds" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_queue_settings_range_ck" CHECK ("worker_queue_settings"."concurrency_min" >= 1 and "worker_queue_settings"."concurrency_max" >= "worker_queue_settings"."concurrency_min"),
	CONSTRAINT "worker_queue_settings_step_ck" CHECK ("worker_queue_settings"."step" >= 1 and "worker_queue_settings"."scale_up_waiting" >= 1)
);
