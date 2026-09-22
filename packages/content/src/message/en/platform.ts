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
  "platform.tenantRetention.organizationFirst":
    "Type an organization id to see what this would retire.",
  "platform.tenantRetention.coldNote":
    "Cold months shorter than the table's are enforced by the nightly run rather than by the bucket.",
  "platform.tenantRetention.saved": "Saved.",
  "platform.tenantExport.title": "Export a tenant",
  "platform.tenantExport.description":
    "One object per table the tenant owns, plus its catalog rows and a manifest of counts and checksums. API key and invitation hashes are redacted.",
  "platform.tenantExport.action": "Start export",
  "platform.tenantExport.queued":
    "Queued as {jobId}. Objects appear below once the worker finishes.",
  "platform.tenantExport.empty": "No export objects for this tenant.",
  // Two expiries, and they are not the same one: the link is minutes, the object is
  // days. Saying only the first would read as "download it whenever".
  "platform.tenantExport.expiry":
    "Download links expire in fifteen minutes; the objects themselves are deleted after seven days.",
  "platform.tenantDelete.title": "Delete a tenant",
  // Said before the fields: every month is archived first, so this is recoverable for
  // thirty days and then the nightly sweep removes the objects too.
  "platform.tenantDelete.warning":
    "Every month is archived to cold storage first, then the tenant's partitions and catalog rows are removed. The archived objects are deleted thirty days later.",
  "platform.tenantDelete.slug": "Type the slug to confirm",
  "platform.tenantDelete.slug.hint": "The server compares this too.",
  "platform.tenantDelete.action": "Delete tenant",
  // A job id, not a tally: the delete archives every month before it drops anything,
  // which for a large tenant is minutes the request no longer waits for.
  "platform.tenantDelete.queued":
    "Queued as {jobId}. Every month is archived before a partition is dropped.",
  "platform.gaps.title": "Gaps",
  "platform.gaps.none": "Every archived month reached the analytics store.",
  "platform.gaps.row": "{period} — {tenants} archived objects never projected.",
  "platform.gaps.reproject": "Re-project this month",
  // Said once rather than per row: the reason is on a log line and is not stored, so
  // the screen can say a gap exists and not why.
  "platform.gaps.reason":
    "Why a month has a gap is on the log line, not in the row. Re-projecting is idempotent.",
  "platform.gaps.queued": "Queued as {jobId}; {objects} objects to read back.",
  "platform.switch.title": "Projection",
  "platform.switch.on": "On",
  "platform.switch.off": "Paused",
  "platform.switch.pause": "Pause projection",
  "platform.switch.resume": "Resume projection",
  "platform.switch.notConfigured": "Not configured",
  "platform.switch.notConfigured.detail":
    "This deployment runs no analytics store. Set CLICKHOUSE_URL to start one.",
  // The deadline, not just the consequence: a pause is recoverable only while the audit
  // table still holds the window, and after that only from cold storage.
  "platform.switch.deadline":
    "While paused, rows stop being projected. The audit table keeps {months} months; resume within that or fill the gap from cold storage.",
  "platform.switch.deadline.unbounded":
    "While paused, rows stop being projected. The audit table has no retention limit set, so the gap stays replayable.",
  "platform.projection.title": "Analytics projection",
  "platform.projection.description":
    "Which actions reach the analytics store, and for how long. Blank keeps an action for the default {months} months.",
  "platform.projection.loading": "Loading…",
  "platform.projection.notConfigured":
    "No analytics store is configured. The rows are saved and take effect when one is.",
  // Drift is what a screen reading only the rows would hide: a save that failed after
  // the commit would still read back as success.
  "platform.projection.drifted":
    "The store holds a different expression from these rows. The nightly run repairs it.",
  "platform.projection.saveTtl": "Save months",
  "platform.projection.stop": "Stop projecting",
  "platform.projection.resume": "Resume projecting",
  // The deadline, not just the consequence: past the Postgres window the gap can only
  // be filled from cold storage, and a screen that omits that reads as reversible.
  "platform.projection.excluded.warning":
    "Rows already in the store stay; new ones stop arriving. Past the audit table's retention window this gap can only be filled from cold storage.",
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
  "platform.shards.title": "Shard map",
  // Counted out of the directory rather than out of the cluster: a node the deployment
  // has just added holds nothing, and so has no row here at all.
  "platform.shards.description":
    "One row per physical node, counted out of the directory. A tenant is placed once, when it is founded, and changes node only when a move job puts it somewhere else.",
  "platform.shards.empty": "The directory is empty — no tenant has been founded yet.",
  "platform.shards.column.node": "Node",
  "platform.shards.column.tenants": "Tenants",
  "platform.shards.column.lastAssigned": "Last placed",
  "platform.shards.column.lastMoved": "Last moved",
  // Null rather than a zero date: a node nothing has ever moved to has no such date,
  // and a made-up one reads as a move that happened.
  "platform.shards.never": "Never",
  "platform.shards.expand": "Show tenants",
  "platform.shards.collapse": "Hide tenants",
  "platform.shards.tenants.title": "Tenants on node {node}",
  "platform.shards.tenants.empty": "No tenant on this node.",
  "platform.shards.column.organization": "Organization",
  "platform.shards.column.assigned": "Placed",
  "platform.shards.column.overrides": "Retention",
  "platform.shards.column.actions": "Actions",
  "platform.shards.overrides.default": "Defaults",
  "platform.shards.overrides.count": "{count} overridden",
  "platform.shards.move": "Move",
  // Spelled out rather than hidden in a tooltip. The button is here so the screen is
  // honest about what is missing, and a reason nobody can read is not honest.
  "platform.shards.move.unavailable": "Tenant moves need the physical split — Phase 24.",
  "platform.shards.manage": "Storage and delete",
  "platform.shards.page": "{from}–{to} of {total}",
  "platform.shards.page.previous": "Previous",
  "platform.shards.page.next": "Next",
  "platform.shards.lookup.title": "Find a tenant",
  "platform.shards.lookup.label": "Organization id or slug",
  // A miss is what a typed search usually is, so this is a sentence rather than an error.
  "platform.shards.lookup.empty": "No tenant answers to that.",
  "platform.shards.lookup.found": "{name} ({slug}) is on node {node}.",
} as const;
