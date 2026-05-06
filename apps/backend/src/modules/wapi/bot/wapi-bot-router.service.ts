import { Injectable, Logger } from '@nestjs/common';
import type { BotRouter, BotRouterRule } from './wapi-bot.types';

/**
 * 4.O.1 — Decide a qué tema entrar dado un input. El motor consulta acá:
 *   - Inbound texto plano → `keyword` rules (case-insensitive, exacto).
 *   - Inbound interactive button con prefijo `bot:tpl:<payload>` → `template-payload`.
 *   - Cualquier otro caso → `default` (último recurso).
 *
 * Las rules se evalúan en orden, primer match gana. Para `template-payload`,
 * los named groups del regex se inyectan como `seedData` — el motor los
 * setea en `session.data` antes de arrancar el flow del tema. Esto permite
 * que un template como `OFERTA_X_PROD_Y` arme un flow con `{{producto}}` ya
 * resuelto desde el payload sin pasar por un CAPTURE.
 */
export interface BotRouterResolution {
  topicId: string;
  /** Variables iniciales para `session.data` (de regex named groups). */
  seedData: Record<string, string>;
  /**
   * 4.O.2 — Tipo de match. `keyword` y `template-payload` son matches explícitos
   * (el cliente *pidió* este tema) y por tanto pueden interrumpir una sesión
   * activa. `default` y `fallback` (kind=default rule o `defaultTopicId`) son
   * catch-alls y no deberían interrumpir.
   */
  via: 'keyword' | 'template-payload' | 'default' | 'fallback';
}

export type BotRouterInput =
  | { kind: 'text'; text: string }
  | { kind: 'template-payload'; payload: string };

@Injectable()
export class WapiBotRouterService {
  private readonly logger = new Logger(WapiBotRouterService.name);

  resolve(router: BotRouter | null | undefined, input: BotRouterInput): BotRouterResolution | null {
    if (!router) return null;
    for (const rule of router.rules) {
      const match = this.tryRule(rule, input);
      if (match) {
        this.logger.debug(
          `Router match: via=${match.via} topic=${match.topicId} seedKeys=${Object.keys(match.seedData).join(',')}`,
        );
        return match;
      }
    }
    if (router.defaultTopicId) {
      this.logger.debug(`Router fallback → defaultTopicId=${router.defaultTopicId}`);
      return { topicId: router.defaultTopicId, seedData: {}, via: 'fallback' };
    }
    return null;
  }

  private tryRule(rule: BotRouterRule, input: BotRouterInput): BotRouterResolution | null {
    if (rule.kind === 'default') {
      return { topicId: rule.topicId, seedData: {}, via: 'default' };
    }
    if (rule.kind === 'template-payload' && input.kind === 'template-payload') {
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern);
      } catch {
        return null;
      }
      const m = re.exec(input.payload);
      if (!m) return null;
      const seedData: Record<string, string> = {};
      if (m.groups) {
        for (const [k, v] of Object.entries(m.groups)) {
          if (typeof v === 'string') seedData[k] = v;
        }
      }
      return { topicId: rule.topicId, seedData, via: 'template-payload' };
    }
    if (rule.kind === 'keyword' && input.kind === 'text') {
      const text = input.text.trim().toLowerCase();
      const hit = rule.keywords.some((kw) => kw.trim().toLowerCase() === text);
      return hit ? { topicId: rule.topicId, seedData: {}, via: 'keyword' } : null;
    }
    return null;
  }
}
