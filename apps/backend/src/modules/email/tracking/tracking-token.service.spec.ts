import { ConfigService } from '@nestjs/config';
import { TrackingTokenService } from './tracking-token.service';

function makeService(env: Record<string, string> = {}): TrackingTokenService {
  const config = new ConfigService({
    EMAIL_TRACKING_JWT_SECRET: 'test-secret',
    EMAIL_PUBLIC_URL: 'http://localhost:3001',
    ...env,
  });
  return new TrackingTokenService(config);
}

describe('TrackingTokenService', () => {
  it('sign + verify roundtrip preserva r/o/t/c', () => {
    const svc = makeService();
    const tok = svc.sign({ r: 'rep-1', o: 'org-1', t: 'team-1', c: 'camp-1' });
    expect(svc.verify(tok)).toEqual({ r: 'rep-1', o: 'org-1', t: 'team-1', c: 'camp-1' });
  });

  it('verify con secret distinto tira', () => {
    const a = makeService({ EMAIL_TRACKING_JWT_SECRET: 'secret-a' });
    const b = makeService({ EMAIL_TRACKING_JWT_SECRET: 'secret-b' });
    const tok = a.sign({ r: 'r', o: 'o', t: 't', c: 'c' });
    expect(() => b.verify(tok)).toThrow();
  });

  it('verify con token basura tira', () => {
    const svc = makeService();
    expect(() => svc.verify('not-a-jwt')).toThrow();
  });

  it('sign sin secret tira', () => {
    const svc = new TrackingTokenService(new ConfigService({}));
    expect(() => svc.sign({ r: 'r', o: 'o', t: 't', c: 'c' })).toThrow(/EMAIL_TRACKING_JWT_SECRET/);
  });

  it('publicUrl default', () => {
    const svc = new TrackingTokenService(new ConfigService({}));
    expect(svc.publicUrl()).toBe('http://localhost:3001');
  });
});
