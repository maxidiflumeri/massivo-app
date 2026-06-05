import {
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  resolveAndValidate,
} from './bot-http-ssrf';

describe('wapi-bot-http-ssrf', () => {
  describe('isPrivateOrReservedIPv4', () => {
    it.each([
      ['0.0.0.0', true],
      ['10.0.0.1', true],
      ['10.255.255.255', true],
      ['100.64.0.1', true], // CGNAT
      ['100.127.255.255', true],
      ['100.128.0.1', false], // fuera de CGNAT
      ['127.0.0.1', true],
      ['127.1.2.3', true],
      ['169.254.169.254', true], // IMDS AWS/GCP
      ['169.254.0.1', true],
      ['172.16.0.1', true],
      ['172.31.255.255', true],
      ['172.32.0.1', false], // fuera de 172.16/12
      ['192.168.0.1', true],
      ['192.168.255.255', true],
      ['192.0.0.1', true], // protocol assignments
      ['198.18.0.1', true], // benchmarking
      ['198.19.255.255', true],
      ['224.0.0.1', true], // multicast
      ['239.255.255.255', true],
      ['240.0.0.1', true], // reserved
      ['255.255.255.255', true], // broadcast
      ['8.8.8.8', false], // Google DNS público
      ['1.1.1.1', false], // Cloudflare DNS
      ['34.107.99.20', false], // Google Cloud IP genérica
    ])('%s → bloqueada=%s', (ip, expected) => {
      expect(isPrivateOrReservedIPv4(ip)).toBe(expected);
    });

    it('forma inválida → bloqueada (conservador)', () => {
      expect(isPrivateOrReservedIPv4('not-an-ip')).toBe(true);
      expect(isPrivateOrReservedIPv4('1.2.3')).toBe(true);
      expect(isPrivateOrReservedIPv4('1.2.3.4.5')).toBe(true);
      expect(isPrivateOrReservedIPv4('256.0.0.1')).toBe(true);
    });
  });

  describe('isPrivateOrReservedIPv6', () => {
    it.each([
      ['::1', true], // loopback
      ['::', true], // unspecified
      ['fc00::1', true], // ULA
      ['fd12:3456:789a::1', true], // ULA
      ['fe80::1', true], // link-local
      ['fea0::1', true],
      ['feb0::1', true],
      ['ff02::1', true], // multicast
      ['ff05::2', true],
      ['2001:db8::1', true], // documentation
      ['64:ff9b::1', true], // NAT64
      ['::ffff:127.0.0.1', true], // IPv4-mapped loopback
      ['::ffff:169.254.169.254', true], // IPv4-mapped IMDS
      ['::ffff:8.8.8.8', false], // IPv4-mapped pública
      ['2606:4700:4700::1111', false], // Cloudflare DNS público
      ['2001:4860:4860::8888', false], // Google DNS público
    ])('%s → bloqueada=%s', (ip, expected) => {
      expect(isPrivateOrReservedIPv6(ip)).toBe(expected);
    });
  });

  describe('resolveAndValidate', () => {
    it('resuelve hostname público y devuelve la IP', async () => {
      // 8.8.8.8 hostname inverso es dns.google → no es público fácil. Usamos
      // un literal IPv4 que dns.lookup tolera (devuelve la misma IP sin DNS query).
      const r = await resolveAndValidate('8.8.8.8', false);
      expect(r.ip).toBe('8.8.8.8');
      expect(r.family).toBe(4);
    });

    it('rechaza loopback', async () => {
      await expect(resolveAndValidate('127.0.0.1', false)).rejects.toThrow(/SSRF/);
    });

    it('rechaza IMDS', async () => {
      await expect(resolveAndValidate('169.254.169.254', false)).rejects.toThrow(/SSRF/);
    });

    it('rechaza IP privada', async () => {
      await expect(resolveAndValidate('10.0.0.1', false)).rejects.toThrow(/SSRF/);
    });

    it('allowPrivate=true permite loopback', async () => {
      const r = await resolveAndValidate('127.0.0.1', true);
      expect(r.ip).toBe('127.0.0.1');
    });

    it('hostname inexistente tira con prefijo SSRF', async () => {
      await expect(
        resolveAndValidate('definitivamente-no-existe-este-host-xyz123.invalid', false),
      ).rejects.toThrow(/SSRF/);
    });
  });
});
