import type { AudioCaptureStopResult } from '../capture';
import type { VoiceInputRound } from './types';

let current: VoiceInputRound | undefined;
// 此等待只由真正打开采集的轮次替换；没有采集的候选不能清除先前的收尾。
let released: Promise<AudioCaptureStopResult> = Promise.resolve({
  status: 'stopped',
});

export function claimVoiceInput(
  round: VoiceInputRound,
): Promise<AudioCaptureStopResult> {
  const previous = current;
  current = round;
  previous?.cancel('replaced');
  return released;
}
export function releaseVoiceInput(round: VoiceInputRound): void {
  if (current === round) current = undefined;
}
export function retainCaptureRelease(
  release: Promise<AudioCaptureStopResult>,
): void {
  released = release;
}
