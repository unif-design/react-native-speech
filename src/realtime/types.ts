import type { PcmAudioBuffer } from '../capture';
import type { SpeechCredentialAccess } from '../credentials';

export interface SpeechSessionError {
  reason:
    | 'credential'
    | 'audio_format'
    | 'transport'
    | 'protocol'
    | 'rejected'
    | 'unsupported';
  message: string;
  sourceCode?: string;
}

export interface SpeechSessionHandlers {
  onStarted(): void;
  onPartial(text: string): void;
  onFinal(text: string): void;
  onFinished(): void;
  onError(error: Readonly<SpeechSessionError>): void;
}

export interface OpenSpeechSessionInput {
  credentials: SpeechCredentialAccess;
  createUuid(): string;
  readVocabulary?: SpeechVocabularyReader;
}

export interface SpeechVocabularyOptions {
  signal: AbortSignal;
}
export interface SpeechVocabularyReader {
  (options: SpeechVocabularyOptions): Promise<readonly string[]>;
}

export interface SpeechSession {
  sendAudio(buffer: Readonly<PcmAudioBuffer>): void;
  finish(): void;
  close(): void;
}

export interface SpeechSessionOpener {
  (handlers: SpeechSessionHandlers): SpeechSession;
}

export interface SpeechStartedEvent {
  type: 'started';
}

export interface SpeechPartialEvent {
  type: 'partial';
  text: string;
  sentenceId?: number;
}

export interface SpeechFinalEvent {
  type: 'final';
  text: string;
  sentenceId?: number;
}

export interface SpeechFinishedEvent {
  type: 'finished';
}

export interface SpeechFailedEvent {
  type: 'failed';
  sourceCode?: string;
}

export interface SpeechIgnoredEvent {
  type: 'ignored';
}

export interface SpeechInvalidEvent {
  type: 'invalid';
}

export type SpeechProtocolEvent =
  | SpeechStartedEvent
  | SpeechPartialEvent
  | SpeechFinalEvent
  | SpeechFinishedEvent
  | SpeechFailedEvent
  | SpeechIgnoredEvent
  | SpeechInvalidEvent;
