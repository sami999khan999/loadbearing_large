import type {
  ApiClient,
  RestoreInput,
  RestoreRequestedDto,
  RetentionUpdateInput,
  TenantRetentionUpdateInput,
} from "../import.js";
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

  // Invalidates the list, which does not carry overrides — but a second tab showing
  // stale table defaults beside a changed override is the confusion worth avoiding.
  public static useUpdateTenantRetention(client: ApiClient) {
    return useAppMutation<{ ok: true }, TenantRetentionUpdateInput>({
      mutationFn: (input) => client.platform.updateTenantRetention(input),
      invalidates: [QueryKeys.platform.retention()],
    });
  }

  // Invalidates nothing: a restore queues a job, and what it changes is a scratch table
  // no read on this screen looks at. The job id in the response is the whole answer.
  public static useRestorePartition(client: ApiClient) {
    return useAppMutation<RestoreRequestedDto, RestoreInput>({
      mutationFn: (input) => client.platform.restorePartition(input),
      invalidates: [],
    });
  }
}
