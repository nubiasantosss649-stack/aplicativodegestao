import * as Crypto from 'expo-crypto';

/** UUID v4 para chaves de idempotência. */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
