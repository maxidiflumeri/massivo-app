import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TrackService } from './track.service';
import { TrackingTokenService } from './tracking-token.service';

// Pixel GIF 1×1 transparente (43 bytes).
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Endpoints públicos de tracking. Sin Clerk: resuelven tenant del JWT del query.
 * Si el token es inválido devuelven 200 (open) o 302 (click) igual — NO queremos
 * que el cliente de email vea errores ni que un atacante use estos endpoints como
 * oráculo de validación.
 */
@Controller()
export class TrackController {
  private readonly logger = new Logger(TrackController.name);

  constructor(
    private readonly tokens: TrackingTokenService,
    private readonly track: TrackService,
  ) {}

  @Get('track/open.gif')
  async open(
    @Query('t') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');

    try {
      const payload = this.tokens.verify(token);
      await this.track.record({
        payload,
        type: 'OPEN',
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`open.gif token inválido: ${msg}`);
    }

    res.status(200).end(PIXEL);
  }

  @Get('track/click')
  async click(
    @Query('t') token: string,
    @Query('u') destination: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!destination) throw new BadRequestException('Falta parámetro u');

    try {
      const payload = this.tokens.verify(token);
      await this.track.record({
        payload,
        type: 'CLICK',
        targetUrl: destination,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`track/click token inválido: ${msg}`);
    }

    res.redirect(302, destination);
  }
}

function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim();
  return req.socket.remoteAddress ?? undefined;
}
