/**
 * Test de integración del AppGateway con Socket.IO real.
 * Mockea solo el SocketContextResolver para devolver tenant A o B
 * según el token del handshake. Verifica:
 *  - emitToTeam llega solo al cliente del team correcto (aislamiento).
 *  - Conexiones sin token / sin teamId / con resolver fail son rechazadas.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'net';
import { AppGateway } from './app.gateway';
import { EventsService } from './events.service';
import { SocketContextResolver } from './socket-context.resolver';

const tenantA = {
  userId: 'user-a',
  organizationId: 'org-a',
  teamId: 'team-a1',
  orgRole: 'OWNER' as const,
  teamRole: 'ADMIN' as const,
};

const tenantB = {
  userId: 'user-b',
  organizationId: 'org-b',
  teamId: 'team-b1',
  orgRole: 'OWNER' as const,
  teamRole: 'ADMIN' as const,
};

describe('AppGateway (integración)', () => {
  let app: INestApplication;
  let url: string;
  let events: EventsService;

  beforeAll(async () => {
    const resolverMock: Partial<SocketContextResolver> = {
      resolve: jest.fn(async (auth: { token?: unknown; teamId?: unknown }) => {
        if (!auth.token) throw new Error('Falta auth.token');
        if (!auth.teamId) throw new Error('Falta auth.teamId');
        if (auth.token === 'tok-A') return tenantA;
        if (auth.token === 'tok-B') return tenantB;
        throw new Error('Token inválido');
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AppGateway,
        EventsService,
        { provide: SocketContextResolver, useValue: resolverMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    const server = app.getHttpServer();
    const addr = server.address() as AddressInfo;
    url = `http://127.0.0.1:${addr.port}`;
    events = moduleRef.get(EventsService);
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(auth: Record<string, string>): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(url, { auth, transports: ['websocket'], reconnection: false });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (err) => reject(err));
    });
  }

  it('emitToTeam aísla por team: cliente B NO recibe evento de team A', async () => {
    const clientA = await connect({ token: 'tok-A', teamId: 'team-a1' });
    const clientB = await connect({ token: 'tok-B', teamId: 'team-b1' });

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    clientA.on('campaign.updated', (p) => receivedA.push(p));
    clientB.on('campaign.updated', (p) => receivedB.push(p));

    events.emitToTeam('team-a1', 'campaign.updated', { id: 'c1' });

    await new Promise((r) => setTimeout(r, 80));

    expect(receivedA).toEqual([{ id: 'c1' }]);
    expect(receivedB).toEqual([]);

    clientA.close();
    clientB.close();
  });

  it('emitToOrg llega a todos los clientes de la org', async () => {
    const clientA = await connect({ token: 'tok-A', teamId: 'team-a1' });

    const received: unknown[] = [];
    clientA.on('org.evt', (p) => received.push(p));

    events.emitToOrg('org-a', 'org.evt', { msg: 'hi' });
    await new Promise((r) => setTimeout(r, 80));

    expect(received).toEqual([{ msg: 'hi' }]);
    clientA.close();
  });

  it('rechaza conexión sin token', async () => {
    await expect(connect({ teamId: 'team-a1' })).rejects.toMatchObject({
      message: expect.stringContaining('Falta auth.token'),
    });
  });

  it('rechaza conexión sin teamId', async () => {
    await expect(connect({ token: 'tok-A' })).rejects.toMatchObject({
      message: expect.stringContaining('Falta auth.teamId'),
    });
  });

  it('rechaza token inválido', async () => {
    await expect(connect({ token: 'tok-X', teamId: 'team-a1' })).rejects.toMatchObject({
      message: expect.stringContaining('Token inválido'),
    });
  });
});
