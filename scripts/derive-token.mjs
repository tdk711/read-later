#!/usr/bin/env node
/**
 * Derive the exact token the browser sends as `Authorization: Bearer ...`.
 *
 * The PIN itself is never sent anywhere. This script only prints the derived
 * token so it can be stored as the Worker secret:
 *
 *   npm run sync:token
 *   npx wrangler secret put SYNC_SECRET   # paste the printed token
 *
 * The constants below MUST stay identical to src/lib/auth.js.
 */
import { webcrypto } from 'node:crypto';

const SALT = 'read-it-later.sync.v1';
const ITERATIONS = 150_000;
const PIN_MIN_LENGTH = 8;
const PIN_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;

function isValidPin(pin) {
  return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

async function deriveToken(pin) {
  const encoder = new TextEncoder();
  const material = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(pin.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256
  );

  return [...new Uint8Array(bits)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Read a line from stdin without echoing it (TTY), or read a piped line. */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      let input = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => {
        input += chunk;
      });
      stdin.on('end', () => resolve(input.split(/\r?\n/)[0] ?? ''));
      stdin.on('error', reject);
      return;
    }

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.on('data', onData);
  });
}

const fromArgument = process.argv[2];
const pin = fromArgument ?? (await promptHidden('Enter your sync PIN (input hidden): '));

if (fromArgument) {
  console.warn('Note: a PIN passed as an argument can end up in shell history.');
}

if (!isValidPin(pin)) {
  console.error(
    `PIN must be at least ${PIN_MIN_LENGTH} characters and contain both letters and numbers (A-Z, a-z, 0-9 only).`
  );
  process.exit(1);
}

const token = await deriveToken(pin);

console.log('');
console.log('Derived token (use this as SYNC_SECRET):');
console.log(token);
console.log('');
console.log('Set it on the deployed Worker:');
console.log('  npx wrangler secret put SYNC_SECRET');
console.log('');
console.log('For local `wrangler dev`, put the same value in .dev.vars:');
console.log(`  SYNC_SECRET=${token}`);
