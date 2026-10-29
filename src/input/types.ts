import type { SpeechSessionOpener } from '../realtime';

export interface VoiceInputPermissions {
  read(ids: readonly 'microphone'[]): Promise<
    readonly {
      id: string;
      status: 'requestable' | 'blocked' | 'granted' | 'limited' | 'unavailable';
    }[]
  >;
  request(id: 'microphone'): Promise<void>;
}

export type VoiceInputState =
  'idle' | 'starting' | 'listening' | 'finishing' | 'error';
export interface VoiceInputText {
  status: 'text';
  text: string;
  completion: 'confirmed' | 'unconfirmed';
}
export interface VoiceInputCancelled {
  status: 'cancelled';
  reason: 'user' | 'replaced';
}
export interface VoiceInputFailed {
  status: 'failed';
  finalText: string;
  reason: 'permission' | 'capture' | 'recognition';
  message: string;
}
export type VoiceInputResult =
  VoiceInputText | VoiceInputCancelled | VoiceInputFailed;
export interface UseVoiceInputOptions {
  permissions: VoiceInputPermissions;
  openRecognition: SpeechSessionOpener;
  onResult(result: Readonly<VoiceInputResult>): void;
}
export interface VoiceInput {
  state: VoiceInputState;
  transcript: string;
  start(): void;
  stop(): void;
  cancel(reason?: 'user' | 'context_ended'): void;
}
export type VoiceInputSnapshot = Pick<VoiceInput, 'state' | 'transcript'>;
export interface VoiceInputRound {
  begin(): void;
  stop(): void;
  cancel(reason: 'user' | 'replaced' | 'context_ended'): void;
}
export interface VoiceInputRoundHandlers {
  update(snapshot: VoiceInputSnapshot): void;
  end(): void;
}
