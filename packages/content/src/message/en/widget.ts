// One title per widget, reached through `WIDGET_COPY` rather than typed at the call site, so a
// widget registered without one does not compile.
export const widget = {
  "widget.zone.dashboard.main": "Dashboard",
  "widget.zone.empty": "Nothing to show here yet.",
  "widget.core.module-nav.title": "Go to",
  "widget.member.count.title": "Members",
  "widget.notification.bell.title": "Notifications",
} as const;
