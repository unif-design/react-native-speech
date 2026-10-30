import { useEffect, useState } from 'react';
import { createStore } from 'zustand/vanilla';
import { useSnapshot } from '../internal/snapshot';
import { createVoiceInputRound } from './createVoiceInputRound';
import type {
  UseVoiceInputOptions,
  VoiceInput,
  VoiceInputRound,
  VoiceInputSnapshot,
} from './types';

export function useVoiceInput(options: UseVoiceInputOptions): VoiceInput {
  const [controller] = useState(() => {
    const store = createStore<VoiceInputSnapshot>(() => ({
      state: 'idle',
      transcript: '',
    }));
    let mounted = true;
    let current: VoiceInputRound | undefined;
    return {
      getSnapshot: store.getState,
      subscribe: store.subscribe,
      mount() {
        mounted = true;
      },
      unmount() {
        mounted = false;
        current?.cancel('context_ended');
      },
      start(input: UseVoiceInputOptions) {
        if (!mounted || current) return;
        const round = createVoiceInputRound(input, {
          update(snapshot) {
            if (current === round) store.setState(snapshot);
          },
          end() {
            if (current === round) current = undefined;
          },
        });
        current = round;
        round.begin();
      },
      stop() {
        current?.stop();
      },
      cancel(reason: 'user' | 'context_ended' = 'user') {
        current?.cancel(reason);
      },
    };
  });
  useEffect(() => {
    controller.mount();
    return () => controller.unmount();
  }, [controller]);
  const snapshot = useSnapshot(controller, (value) => value);
  return {
    ...snapshot,
    start: () => controller.start(options),
    stop: controller.stop,
    cancel: controller.cancel,
  };
}
