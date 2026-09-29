import { useSession } from "../auth/index.js";
import { useMessages } from "../i18n/index.js";
import {
  type CapabilitySet,
  EmptyState,
  type FlagKey,
  MemberQueries,
  type NavItem,
  type QueryRuntime,
  type ReactNode,
  useMemo,
  WIDGET_COPY,
  WidgetRegistry,
  ZONE_COPY,
  Zone,
  type ZoneWidgetKey,
} from "../import.js";
import { MemberCount } from "../member/index.js";
import { ModuleNav, type ModuleNavProps } from "../nav/index.js";
import { widgetFacts } from "../widget/index.js";

const ZONE = "dashboard.main";

type DashboardWidgetKey = ZoneWidgetKey<typeof ZONE>;

export interface DashboardZoneProps {
  // The nav card's menu and links, resolved by the route. Passed through, so the card
  // stays synchronous and the router stays out of this package.
  readonly nav: readonly NavItem[];
  readonly renderLink: ModuleNavProps["renderLink"];
}

interface DashboardWidget {
  readonly component: (props: DashboardZoneProps) => ReactNode;
  // What the card reads, fetched by the route before it renders. Absent for a card that
  // reads nothing.
  readonly prefetch?: (
    queryClient: QueryRuntime["queryClient"],
    client: QueryRuntime["apiClient"],
  ) => Promise<unknown>;
}

// The count's page: `limit: 1`, because only `total` is read.
const MEMBER_PAGE = { limit: 1, offset: 0 } as const;

function DashboardNav({ nav, renderLink }: DashboardZoneProps) {
  const { capabilities } = useSession();
  return <ModuleNav items={nav} capabilities={capabilities} renderLink={renderLink} />;
}

// Total over the zone: a widget registered to it without an entry here does not compile.
// Not exported, so nothing outside can render a card without asking the registry first.
const DASHBOARD_WIDGETS = {
  "core.module-nav": { component: DashboardNav },
  "member.count": {
    component: () => <MemberCount />,
    prefetch: (queryClient, client) =>
      queryClient.ensureQueryData(MemberQueries.list(client, MEMBER_PAGE)),
  },
} as const satisfies Record<DashboardWidgetKey, DashboardWidget>;

const isDashboardWidget = (key: string): key is DashboardWidgetKey =>
  Object.hasOwn(DASHBOARD_WIDGETS, key);

// Visible ones only, in the registry's order. A hidden card is never mounted, so it never
// issues its query: hiding is not a `display: none`.
function visibleWidgets(
  capabilities: CapabilitySet,
  flags: Iterable<FlagKey>,
): readonly DashboardWidgetKey[] {
  const facts = widgetFacts(capabilities, flags);
  return WidgetRegistry.instance
    .forZone(ZONE)
    .filter(isDashboardWidget)
    .filter((key) => WidgetRegistry.instance.visibilityOf(key, facts) === "visible");
}

export function DashboardZone(props: DashboardZoneProps) {
  const { t } = useMessages("widget");
  const { capabilities, flags } = useSession();
  const keys = useMemo(() => visibleWidgets(capabilities, flags), [capabilities, flags]);

  return (
    <Zone
      label={t(ZONE_COPY[ZONE])}
      items={keys.map((key) => {
        const Card = DASHBOARD_WIDGETS[key].component;
        return { key, title: t(WIDGET_COPY[key]), content: <Card {...props} /> };
      })}
      empty={<EmptyState title={t("widget.zone.empty")} />}
    />
  );
}

// The route's half: the same visibility the zone will compute, so a hidden card's query is
// never issued ahead of a render that will not mount it.
export async function prefetchDashboard(
  queryClient: QueryRuntime["queryClient"],
  client: QueryRuntime["apiClient"],
  capabilities: CapabilitySet,
  flags: Iterable<FlagKey>,
): Promise<void> {
  await Promise.all(
    visibleWidgets(capabilities, flags).map((key) => {
      const widget: DashboardWidget = DASHBOARD_WIDGETS[key];
      return widget.prefetch ? widget.prefetch(queryClient, client) : Promise.resolve();
    }),
  );
}
