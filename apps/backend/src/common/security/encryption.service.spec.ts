/**
 * Tests del AesGcmEncryptionService.
 *  - encrypt+decrypt roundtrip preserva el plaintext.
 *  - decrypt detecta tampering (auth tag inválido) y tira.
 *  - decrypt rechaza versión desconocida.
 *  - decrypt cachea: segundo decrypt no re-llama crypto (verificable porque
 *    una clave borrada en el medio igual devuelve el plaintext cacheado).
 *  - sin MASSIVO_ENCRYPTION_KEY → modo legacy: encrypt es no-op, decrypt
 *    devuelve el valor tal cual mientras no tenga prefijo v1:.
 *  - rechaza claves de tamaño incorrecto.
 *  - isEncrypted distingue v1: de plaintext.
 */
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AesGcmEncryptionService } from './encryption.service';

function makeService(config: Record<string, string>): AesGcmEncryptionService {
  const svc = new AesGcmEncryptionService(new ConfigService(config));
  svc.onModuleInit();
  return svc;
}

const KEY_HEX = randomBytes(32).toString('hex');

describe('AesGcmEncryptionService', () => {
  it('encrypt+decrypt roundtrip', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    const plaintext = 'EAAGm0PX4ZCpsBAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const enc = svc.encrypt(plaintext);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain(plaintext);
    expect(svc.decrypt(enc)).toBe(plaintext);
  });

  it('cada encrypt() del mismo plaintext produce ciphertext distinto (IV random)', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('same');
    expect(svc.decrypt(b)).toBe('same');
  });

  it('decrypt detecta tampering en el ciphertext', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    const enc = svc.encrypt('secreto');
    const parts = enc.split(':');
    // Flippea el ciphertext (parte 2) sustituyendo el primer char por 'A'.
    parts[2] = 'A' + parts[2]!.slice(1);
    const tampered = parts.join(':');
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('decrypt rechaza versión desconocida', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    expect(() => svc.decrypt('v9:aaa:bbb:ccc')).toThrow(/formato inválido/);
  });

  it('clave de tamaño incorrecto → onModuleInit tira', () => {
    expect(() =>
      makeService({ MASSIVO_ENCRYPTION_KEY: 'deadbeef' }),
    ).toThrow(/32 bytes/);
  });

  it('soporta clave en base64 vía MASSIVO_ENCRYPTION_KEY_B64', () => {
    const b64 = randomBytes(32).toString('base64');
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY_B64: b64 });
    expect(svc.decrypt(svc.encrypt('hola'))).toBe('hola');
  });

  it('sin clave master: encrypt es no-op (legacy mode)', () => {
    const svc = makeService({});
    expect(svc.encrypt('plain')).toBe('plain');
    expect(svc.isEncrypted('plain')).toBe(false);
  });

  it('sin clave master pero valor v1: → decrypt tira', () => {
    const svc = makeService({});
    expect(() => svc.decrypt('v1:aa:bb:cc')).toThrow(/no está seteada/);
  });

  it('decrypt() de plaintext legacy (sin prefijo) lo devuelve sin cambios', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    expect(svc.decrypt('legacy-plain')).toBe('legacy-plain');
  });

  it('isEncrypted distingue v1: de plaintext', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    expect(svc.isEncrypted('v1:a:b:c')).toBe(true);
    expect(svc.isEncrypted('plain')).toBe(false);
  });

  it('decrypt cachea por ciphertext: segunda llamada no re-decripta', () => {
    const svc = makeService({ MASSIVO_ENCRYPTION_KEY: KEY_HEX });
    const enc = svc.encrypt('cached');
    expect(svc.decrypt(enc)).toBe('cached');
    // "Rompemos" la masterKey: cualquier nuevo decrypt debería tirar, pero el
    // cached devuelve el plaintext sin tocar crypto.
    (svc as unknown as { masterKey: Buffer | null }).masterKey = null;
    expect(svc.decrypt(enc)).toBe('cached');
  });
});
