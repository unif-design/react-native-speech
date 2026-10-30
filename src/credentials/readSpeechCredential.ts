import { URL } from 'react-native-url-polyfill';
import { SPEECH_CREDENTIAL_MARGIN_SECONDS } from './constants';
import type { SpeechCredential } from './types';

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validWebSocketUrl(value: string): boolean {
  if (value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'wss:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function readSpeechCredential(
  value: unknown,
  nowSeconds = Date.now() / 1000,
): Readonly<SpeechCredential> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const token = data.token;
  const expiresAtSeconds = data.expiresAtSeconds;
  const wsUrl = data.wsUrl;
  if (
    !nonEmptyText(token) ||
    typeof expiresAtSeconds !== 'number' ||
    !Number.isFinite(expiresAtSeconds) ||
    expiresAtSeconds - nowSeconds <= SPEECH_CREDENTIAL_MARGIN_SECONDS ||
    !nonEmptyText(wsUrl) ||
    !validWebSocketUrl(wsUrl)
  )
    return null;
  return Object.freeze({ token, expiresAtSeconds, wsUrl });
}
