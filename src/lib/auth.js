import { writable } from 'svelte/store';
import { verifyToken, UnauthorizedError } from './api.js';

/**
 * PIN authentication.
 *
 * The PIN never leaves the browser. It is stretched with PBKDF2-SHA-256 using
 * a fixed, app-wide salt so that every device derives the exact same 256-bit
 * hex token from the same PIN. The token is what the Worker compares with
 * `env.SYNC_SECRET`.
 *
 * Keeping the salt and iteration count fixed is what makes the PIN portable
 * across devices. Changing either value would invalidate every existing token.
 */
export const PBKDF2_SALT = 'read-it-later.sync.v1';
export const PBKDF2_ITERATIONS = 150_000;
export const PIN_MIN_LENGTH = 8;
export const PIN_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;

const STORAGE_KEY = 'read-it-later.sync-token';

/** In-memory only. Never written to disk directly. */
let memoryToken = null;

export const auth = writable({
  ready: false,
  unlocked: false,
  trusted: false,
  error: '',
});

function publish(extra = {}) {
  auth.set({
    ready: true,
    unlocked: Boolean(memoryToken),
    trusted: hasTrustedToken(),
    error: '',
    ...extra,
  });
}

export function isValidPin(pin) {
  return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

/**
 * Derive the deterministic 256-bit token as lowercase hex.
 * The same PIN must produce the same token on every device and in
 * scripts/derive-token.mjs.
 */
export async function deriveToken(pin) {
  if (!isValidPin(pin)) {
    throw new Error(`PIN must be at least ${PIN_MIN_LENGTH} letters and numbers.`);
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable. Open the app over HTTPS or on localhost.');
  }

  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256
  );

  return [...new Uint8Array(bits)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function readStorage(storage) {
  try {
    const value = storage.getItem(STORAGE_KEY);
    return value && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

function writeStorage(storage, token) {
  try {
    if (token) storage.setItem(STORAGE_KEY, token);
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing or blocked storage: the in-memory token still works.
  }
}

function hasTrustedToken() {
  return Boolean(readStorage(localStorage));
}

/**
 * Restore a token saved earlier in this tab (sessionStorage) or on this device
 * (localStorage, only when the user chose "Trust this device").
 */
export function restoreSession() {
  const trusted = readStorage(localStorage);
  const session = trusted ? null : readStorage(sessionStorage);
  memoryToken = trusted || session;
  publish();
  return Boolean(memoryToken);
}

/**
 * Derive the token, verify it with the Worker, then keep it for this session
 * (or on this device when `remember` is true).
 *
 * Verification is deliberately required: without it, any PIN would unlock the
 * local UI and the real PIN check would only happen on the next background
 * sync.
 */
export async function unlock(pin, { remember = false } = {}) {
  publish({ error: '' });

  const token = await deriveToken(pin);

  try {
    await verifyToken(token);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw new Error('That PIN is not correct. Try again.');
    }
    throw error;
  }

  memoryToken = token;

  if (remember) {
    writeStorage(localStorage, token);
    writeStorage(sessionStorage, null);
  } else {
    writeStorage(sessionStorage, token);
    writeStorage(localStorage, null);
  }

  publish();
  return token;
}

/** Forget the token in memory and in both storages. */
export function lock() {
  memoryToken = null;
  writeStorage(localStorage, null);
  writeStorage(sessionStorage, null);
  publish();
}

export function getToken() {
  return memoryToken;
}

export function isUnlocked() {
  return Boolean(memoryToken);
}

export function setAuthError(message) {
  publish({ error: message });
}
