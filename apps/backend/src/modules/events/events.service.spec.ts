import { EventsService } from './events.service';

describe('EventsService', () => {
  let service: EventsService;
  let toMock: jest.Mock;
  let emitMock: jest.Mock;

  beforeEach(() => {
    service = new EventsService();
    emitMock = jest.fn();
    toMock = jest.fn().mockReturnValue({ emit: emitMock });
    service.setServer({ to: toMock } as never);
  });

  it('emitToTeam delega a server.to(team:id).emit', () => {
    service.emitToTeam('team-1', 'campaign.updated', { x: 1 });
    expect(toMock).toHaveBeenCalledWith('team:team-1');
    expect(emitMock).toHaveBeenCalledWith('campaign.updated', { x: 1 });
  });

  it('emitToOrg delega a server.to(org:id).emit', () => {
    service.emitToOrg('org-1', 'evt', null);
    expect(toMock).toHaveBeenCalledWith('org:org-1');
  });

  it('emitToUser delega a server.to(user:id).emit', () => {
    service.emitToUser('user-1', 'evt', null);
    expect(toMock).toHaveBeenCalledWith('user:user-1');
  });

  it('sin server seteado: no rompe', () => {
    const fresh = new EventsService();
    expect(() => fresh.emitToTeam('t', 'e', null)).not.toThrow();
  });

  it('roomsFor devuelve los 3 rooms en el orden esperado', () => {
    expect(EventsService.roomsFor('o', 't', 'u')).toEqual(['org:o', 'team:t', 'user:u']);
  });

  describe('emitToTeamDebounced (throttle leading+trailing)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('leading edge: el primer emit del burst sale inmediato', () => {
      service.emitToTeamDebounced('team-1', 'evt', 'key-a', { n: 1 }, 1000);
      expect(emitMock).toHaveBeenCalledTimes(1);
      expect(emitMock).toHaveBeenCalledWith('evt', { n: 1 });
    });

    it('trailing edge: dentro del intervalo, agenda 1 emit con el último payload', () => {
      service.emitToTeamDebounced('team-1', 'evt', 'k', { n: 1 }, 1000); // leading
      service.emitToTeamDebounced('team-1', 'evt', 'k', { n: 2 }, 1000);
      service.emitToTeamDebounced('team-1', 'evt', 'k', { n: 3 }, 1000);
      expect(emitMock).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1000);
      expect(emitMock).toHaveBeenCalledTimes(2);
      expect(emitMock).toHaveBeenLastCalledWith('evt', { n: 3 });
    });

    it('emits posteriores al intervalo salen como nuevo leading edge', () => {
      service.emitToTeamDebounced('team-1', 'evt', 'k', { n: 1 }, 1000);
      jest.advanceTimersByTime(1500);
      expect(emitMock).toHaveBeenCalledTimes(1);
      service.emitToTeamDebounced('team-1', 'evt', 'k', { n: 2 }, 1000);
      expect(emitMock).toHaveBeenCalledTimes(2);
      expect(emitMock).toHaveBeenLastCalledWith('evt', { n: 2 });
    });

    it('keys distintas no comparten estado', () => {
      service.emitToTeamDebounced('team-1', 'evt', 'a', { v: 'a' }, 500);
      service.emitToTeamDebounced('team-1', 'evt', 'b', { v: 'b' }, 500);
      expect(emitMock).toHaveBeenCalledTimes(2);
    });

    it('onModuleDestroy limpia trailing timers pendientes', () => {
      service.emitToTeamDebounced('team-1', 'evt', 'k', { x: 1 }, 1000); // leading
      service.emitToTeamDebounced('team-1', 'evt', 'k', { x: 2 }, 1000); // schedules trailing
      service.onModuleDestroy();
      jest.advanceTimersByTime(2000);
      expect(emitMock).toHaveBeenCalledTimes(1);
    });

    it('sin server: no rompe', () => {
      const fresh = new EventsService();
      expect(() => fresh.emitToTeamDebounced('t', 'e', 'k', null)).not.toThrow();
    });
  });
});
