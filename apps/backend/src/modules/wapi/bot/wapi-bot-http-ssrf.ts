/**
 * 4.N.3 — SSRF guard puro (sin Nest/DI). Bloquea IPs privadas, reservadas y
 * link-local (IMDS 169.254.169.254). Diseñado para usarse junto con un agent
 * HTTP custom que SE QUEDA con la IP resuelta acá — eso previene DNS rebinding
 * (un dominio atacante que devuelve IP pública en el primer lookup y privada
 * en el segundo).
 *
 * Uso típico:
 *   const target = await resolveAndValidate('api.example.com', false);
 *   // target.ip = '34.x.y.z' (ya validada)
 *   // pasar target.ip al agent HTTP (undici Agent con custom `connect.lookup`).
 */
import { lookup } from 'node:dns/promises';

export interface ResolvedTarget {
  ip: string;
  family: 4 | 6;
}

/**
 * Bloquea IPv4 en estos rangos (RFC 1918 + reserved + link-local):
 *  - 0.0.0.0/8            — "this network"
 *  - 10.0.0.0/8           — private
 *  - 100.64.0.0/10        — CGNAT (no es estrictamente privado pero no debería ser destino)
 *  - 127.0.0.0/8          — loopback
 *  - 169.254.0.0/16       — link-local (incluye 169.254.169.254 = AWS/GCP IMDS)
 *  - 172.16.0.0/12        — private
 *  - 192.0.0.0/24         — protocol assignments
 *  - 192.168.0.0/16       — private
 *  - 198.18.0.0/15        — benchmarking
 *  - 224.0.0.0/4          — multicast
 *  - 240.0.0.0/4          — reserved
 *  - 255.255.255.255      — broadcast
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true; // forma inválida → bloquear conservador
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10  → 64..127
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12  → 16..31
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24
  if (a === 192 && b === 0 && octets[2] === 0) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15  → 18..19
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (multicast) y 240.0.0.0/4 (reserved)
  if (a >= 224) return true;
  // 255.255.255.255 (broadcast) — cubierto por a >= 224 pero explícito por claridad
  if (a === 255 && b === 255 && octets[2] === 255 && octets[3] === 255) return true;
  return false;
}

/**
 * Bloquea IPv6 en:
 *  - ::1                  — loopback
 *  - ::                   — unspecified
 *  - fc00::/7             — unique local (incluye fc00::/8 y fd00::/8)
 *  - fe80::/10            — link-local
 *  - ff00::/8             — multicast
 *  - ::ffff:0:0/96        — IPv4-mapped IPv6 (validar el IPv4 embebido)
 *  - 64:ff9b::/96         — well-known NAT64
 *  - 2001:db8::/32        — documentation
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  // IPv4-mapped: ::ffff:a.b.c.d — validar el IPv4
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  if (mapped && mapped[1]) return isPrivateOrReservedIPv4(mapped[1]);
  if (lower.startsWith('2001:db8:')) return true;
  if (lower.startsWith('64:ff9b:')) return true;
  if (lower.startsWith('ff')) return true; // multicast ff00::/8
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true; // link-local fe80::/10
  }
  // fc00::/7: el primer hex es 'fc' o 'fd'
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  return false;
}

/**
 * Resuelve el hostname con `node:dns/promises` y valida la IP contra blocklist.
 * Si `allowPrivate=true`, salta el bloqueo (útil sólo en dev local con flag
 * `WAPI_BOT_HTTP_ALLOW_PRIVATE_IPS=true` para apuntar a APIs en localhost).
 *
 * Tira `Error('SSRF: ...')` si la IP está bloqueada o el hostname no resuelve.
 *
 * `verbatim: true` evita que el resolver reordene IPv4 vs IPv6 (Node 18+).
 * Sólo tomamos la PRIMERA IP — para conexiones HTTP el agent debe usar esa
 * misma (sin re-DNS), garantizado pasando `target.ip` al `connect.lookup` del
 * agent.
 */
export async function resolveAndValidate(
  hostname: string,
  allowPrivate: boolean,
): Promise<ResolvedTarget> {
  let addr: Awaited<ReturnType<typeof lookup>>;
  try {
    addr = await lookup(hostname, { verbatim: true });
  } catch (err) {
    throw new Error(`SSRF: no se pudo resolver ${hostname}: ${(err as Error).message}`);
  }
  if (allowPrivate) {
    return { ip: addr.address, family: addr.family as 4 | 6 };
  }
  const blocked =
    addr.family === 4
      ? isPrivateOrReservedIPv4(addr.address)
      : isPrivateOrReservedIPv6(addr.address);
  if (blocked) {
    throw new Error(`SSRF: IP bloqueada ${addr.address} (${hostname})`);
  }
  return { ip: addr.address, family: addr.family as 4 | 6 };
}
