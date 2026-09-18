import type { ApiClient, RetentionUpdateInput } from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

export class PlatformMutations {
  private constructor() {}

  // No optimistic update: the refetched list carries what the bucket and ClickHouse
  // *now* hold, and an optimistic row would hide the drift the save may have caused.
  public static useUpdateRetention(client: ApiClient) {
    return useAppMutation<{ ok: true }, RetentionUpdateInput>({
      mutationFn: (input) => client.platform.updateRetention(input),
      invalidates: [QueryKeys.platform.retention()],
    });
  }
}
