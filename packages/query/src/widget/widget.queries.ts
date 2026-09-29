import type { ApiClient } from "../import.js";
import { queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

export class WidgetQueries {
  private constructor() {}

  // Five minutes: a hide is this person's own click, which invalidates it; nobody else's
  // action changes it but an admin's default, and a card reappearing late is harmless.
  public static preferences(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.widget.preferences(),
      queryFn: () => client.widget.preferences({}),
      staleTime: 300_000,
    });
  }
}
