export const platform = {
  "platform.title": "Platform",
  "platform.subtitle":
    "Settings above any one tenant. Held through a role in the platform organization, not through the tenant you are signed into.",
  "platform.status.title": "Status",
  "platform.organization": "Platform organization",
  // The slug, because the id is what an operator pastes into a query and the name is
  // what they recognise. Both, rather than a choice between them.
  "platform.organization.detail": "{name} ({slug})",
  "platform.health.title": "Dependencies",
  "platform.health.healthy": "Healthy",
  "platform.health.degraded": "Degraded",
  "platform.health.database": "Postgres",
  "platform.health.cache": "Redis — cache",
  "platform.health.queue": "Redis — queue",
  "platform.health.analytics": "ClickHouse",
  "platform.health.realtime": "Realtime fan-out",
  "platform.state.up": "Up",
  "platform.state.down": "Down",
  // The third state, and the one that matters: absent is neither passing nor failing,
  // and a screen that showed "Down" here would report an outage nobody has.
  "platform.state.absent": "Not configured",

  "platform.retention.title": "Retention",
  "platform.retention.description":
    "How long each table keeps data in Postgres, and how long its archived months stay in object storage after that. A table with no row here uses the built-in default.",
  "platform.retention.table": "Table",
  "platform.retention.hotMonths": "Months in Postgres",
  "platform.retention.coldMonths": "Months in cold storage",
  "platform.retention.coldMonths.hint": "Blank never expires.",
  "platform.retention.mode": "When a month ages out",
  "platform.retention.mode.archive": "Archive, then drop",
  "platform.retention.mode.drop": "Drop",
  "platform.retention.save": "Save",
  "platform.retention.default": "Default",
  // Said plainly, because it is the one setting on this page that destroys data and
  // the word "drop" on a button does not carry it.
  "platform.retention.mode.warning":
    "A month dropped this way is not in cold storage and cannot be restored.",
  "platform.retention.neverDropped": "Never dropped — domain data.",
  "platform.retention.clickhouse": "ClickHouse",
  "platform.retention.clickhouse.months": "Months of analytics history",
  "platform.retention.preview.loading": "Working out what this would drop…",
  "platform.retention.preview.invalid": "Enter a whole number of months, at least one.",
  "platform.retention.preview.failed": "Could not work out what this would drop.",
  "platform.retention.preview.none": "The next run would drop nothing.",
  // Rows are the planner's estimate, refreshed by autovacuum — hence "about", which is
  // the honest word and not a hedge.
  "platform.retention.preview.summary":
    "The next run drops {partitions} partitions, about {rows} rows, {bytes} bytes.",
  "platform.tenantRetention.title": "One tenant's retention",
  "platform.tenantRetention.description":
    "Overrides the table's own numbers for one organization. Only tables the calendar already retires can be overridden.",
  "platform.tenantRetention.organization": "Organization id",
  // The asymmetry: hot months are exact because the tenant's month is its own
  // partition, and cold months are the worker's because a prefix rule cannot be.
  "platform.tenantRetention.coldNote":
    "Cold months shorter than the table's are enforced by the nightly run rather than by the bucket.",
  "platform.tenantRetention.saved": "Saved.",
  "platform.storage.title": "Cold storage by tenant",
  // Said on the screen, not only in a doc: a partition holds one tenant's rows, but
  // the catalog reports size per table, so hot bytes have no tenant to belong to.
  "platform.storage.description":
    "Archived months only. Hot Postgres size cannot be attributed to a tenant; per-table hot size is on the retention screen.",
  "platform.storage.filter": "Organization id",
  "platform.storage.empty": "Nothing has been archived yet.",
  "platform.storage.column.organization": "Organization",
  "platform.storage.column.table": "Table",
  "platform.storage.column.bytes": "Size",
  "platform.storage.column.rows": "Rows",
  "platform.storage.column.months": "Months",
  "platform.storage.column.period": "Month",
  "platform.storage.column.actionCounts": "Actions",
  "platform.storage.column.projected": "Projected",
  // Null means ClickHouse never received this tenant-month — a recorded gap rather
  // than a blocked drop, which is why it has to be readable here.
  "platform.storage.notProjected": "Never",
  "platform.storage.months.title": "Archived months",
  "platform.restore.title": "Restore a month",
  // Both outcomes, because which applies is not the operator's to choose: inside the
  // hot window it goes live, outside it stays where retention will not fight it.
  "platform.restore.description":
    "Reads a month back out of cold storage. Inside the table's hot window it is attached and live again; outside it, it lands in a scratch table and stays there — raise the hot months first if you need it live.",
  "platform.restore.table": "Table",
  "platform.restore.period": "Month",
  "platform.restore.submit": "Restore",
  "platform.restore.queued": "Queued as {jobId}. {objects} objects to read back.",
  "platform.retention.drift":
    "The store holds something else. The nightly run will put this right; it now holds {actual}.",
} as const;
