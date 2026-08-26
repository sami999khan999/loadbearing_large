import { type UseMutationOptions, useMutation, useQueryClient } from "../import.js";

export interface AppMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, Error, TVariables>, "onSuccess"> {
  // Keys invalidated after a successful mutation. Declared, never imperative — so
  // "what does reactivating a task affect" has one answer in one place.
  readonly invalidates?: readonly (readonly unknown[])[];
  readonly onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
}

export function useAppMutation<TData, TVariables>(options: AppMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    ...options,
    onSuccess: async (data, variables) => {
      // Invalidations first, then the caller's hook. A caller that navigates on success
      // should not race the refetch of the screen it is leaving.
      await Promise.all(
        (options.invalidates ?? []).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
      await options.onSuccess?.(data, variables);
    },
  });
}
