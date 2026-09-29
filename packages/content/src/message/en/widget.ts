// One title per widget, reached through `WIDGET_COPY` rather than typed at the call site, so a
// widget registered without one does not compile.
export const widget = {
  "widget.zone.dashboard.main": "Dashboard",
  "widget.zone.empty": "Nothing to show here yet.",
  "widget.core.module-nav.title": "Go to",
  "widget.member.count.title": "Members",
  "widget.notification.bell.title": "Notifications",
  "widget.core.hidden-widgets.title": "Hidden cards",
  "widget.hide": "Hide",
  "widget.hideCard": "Hide {title}",
  "widget.restore": "Show again",
  "widget.restoreCard": "Show {title} again",
  "widget.hidden.none": "No card is hidden.",
  "widget.hidden.byAdmin": "Hidden for everyone by your organization",
  "widget.defaults.title": "Dashboard cards",
  // Said on the page, because the obvious misreading is that hiding a card takes something away.
  "widget.defaults.description":
    "Hide a card for everyone in this organization. Hiding a card is not removing access: anyone allowed to see its data still can, one link away.",
  "widget.defaults.unavailable": "Hiding cards is not available for this organization yet.",
  "widget.defaults.hidden": "Hidden for everyone",
  "widget.defaults.shown": "Shown",
  "widget.defaults.hide": "Hide for everyone",
  "widget.defaults.show": "Show to everyone",
} as const;
