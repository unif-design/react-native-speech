import { useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { SnapshotSource } from './types';

// 选择原值或由稳定字段组成的浅层对象；共享状态仍由传入的来源维护。
export function useSnapshot<Snapshot, Selection>(
  source: SnapshotSource<Snapshot>,
  selector: (snapshot: Snapshot) => Selection,
): Selection {
  const select = useShallow(selector);
  return useSyncExternalStore(source.subscribe, () =>
    select(source.getSnapshot()),
  );
}
