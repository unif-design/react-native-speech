export interface SpeechCredential {
  token: string;
  expiresAtSeconds: number;
  wsUrl: string;
}

export interface SpeechCredentialOptions {
  signal?: AbortSignal;
}

export interface SpeechCredentialSuccess {
  status: 'success';
  credential: Readonly<SpeechCredential>;
}

export interface SpeechCredentialCancelled {
  status: 'cancelled';
}

export type SpeechCredentialFailureReason =
  'access' | 'rejected' | 'invalid_response' | 'unavailable';

export interface SpeechCredentialFailed {
  status: 'failed';
  reason: SpeechCredentialFailureReason;
  message: string;
  httpStatus?: number;
}

export type SpeechCredentialResult =
  SpeechCredentialSuccess | SpeechCredentialCancelled | SpeechCredentialFailed;

export interface SpeechCredentialRequest {
  (options?: SpeechCredentialOptions): Promise<SpeechCredentialResult>;
}

export interface SpeechCredentialAccess {
  get(options?: SpeechCredentialOptions): Promise<SpeechCredentialResult>;
  invalidate(credential: Readonly<SpeechCredential>): void;
  dispose(): void;
}
