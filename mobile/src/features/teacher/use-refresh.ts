import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/** Pull-to-refresh state for screens backed by the given query keys. */
export function usePullToRefresh(keys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    void Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).finally(() =>
      setRefreshing(false),
    );
  };
  return { refreshing, onRefresh };
}
