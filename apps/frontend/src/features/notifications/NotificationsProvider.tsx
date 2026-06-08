import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../api/client';
import { useTeamSocket } from '../../realtime/useTeamSocket';
import { notificationsApi } from './api';
import { playNotificationSound } from './notificationSound';
import type {
  NotificationItem,
  NotificationListResult,
  NotificationReadAllEvent,
  NotificationReadEvent,
} from './types';

const SOUND_KEY = 'massivo:notif:sound';
const DESKTOP_KEY = 'massivo:notif:desktop';
const MAX_PER_BUCKET = 20;

interface State {
  mine: NotificationItem[];
  unassigned: NotificationItem[];
  mineUnread: number;
  unassignedUnread: number;
}

type Action =
  | { kind: 'hydrate'; data: NotificationListResult }
  | { kind: 'new'; item: NotificationItem }
  | { kind: 'read'; ev: NotificationReadEvent }
  | { kind: 'readAll'; ev: NotificationReadAllEvent }
  | { kind: 'reset' };

const EMPTY: State = { mine: [], unassigned: [], mineUnread: 0, unassignedUnread: 0 };

function matches(n: NotificationItem, ev: NotificationReadEvent): boolean {
  if (ev.id) return n.id === ev.id;
  if (ev.conversationId) {
    return n.conversationId === ev.conversationId && (!ev.bucket || n.bucket === ev.bucket);
  }
  return false;
}

function reducer(state: State, action: Action): State {
  switch (action.kind) {
    case 'reset':
      return EMPTY;
    case 'hydrate':
      return {
        mine: action.data.mine.filter((n) => !n.read),
        unassigned: action.data.unassigned.filter((n) => !n.read),
        mineUnread: action.data.mineUnread,
        unassignedUnread: action.data.unassignedUnread,
      };
    case 'new': {
      const item = action.item;
      const isMine = item.bucket === 'mine';
      const list = isMine ? state.mine : state.unassigned;
      const wasPresent = list.some((n) => n.id === item.id);
      const next = [item, ...list.filter((n) => n.id !== item.id)].slice(0, MAX_PER_BUCKET);
      const delta = item.read || wasPresent ? 0 : 1;
      return isMine
        ? { ...state, mine: next, mineUnread: state.mineUnread + delta }
        : { ...state, unassigned: next, unassignedUnread: state.unassignedUnread + delta };
    }
    case 'read': {
      const ev = action.ev;
      const dropMine = state.mine.filter((n) => matches(n, ev));
      const dropUn = state.unassigned.filter((n) => matches(n, ev));
      return {
        mine: state.mine.filter((n) => !matches(n, ev)),
        unassigned: state.unassigned.filter((n) => !matches(n, ev)),
        mineUnread: Math.max(0, state.mineUnread - dropMine.length),
        unassignedUnread: Math.max(0, state.unassignedUnread - dropUn.length),
      };
    }
    case 'readAll':
      return action.ev.bucket === 'mine'
        ? { ...state, mine: [], mineUnread: 0 }
        : { ...state, unassigned: [], unassignedUnread: 0 };
    default:
      return state;
  }
}

export interface NotificationsContextValue {
  mine: NotificationItem[];
  unassigned: NotificationItem[];
  mineUnread: number;
  unassignedUnread: number;
  totalUnread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (bucket?: 'mine' | 'unassigned' | 'all') => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  desktopEnabled: boolean;
  setDesktopEnabled: (v: boolean) => void | Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  ...EMPTY,
  totalUnread: 0,
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  soundEnabled: true,
  setSoundEnabled: () => {},
  desktopEnabled: false,
  setDesktopEnabled: () => {},
});

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const socket = useTeamSocket();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [loading, setLoading] = useState(false);

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(
    () => (localStorage.getItem(SOUND_KEY) ?? '1') === '1',
  );
  const [desktopEnabled, setDesktopEnabledState] = useState<boolean>(
    () => localStorage.getItem(DESKTOP_KEY) === '1' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted',
  );

  // Refs para leer settings dentro de handlers del socket sin re-suscribir.
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const desktopRef = useRef(desktopEnabled);
  desktopRef.current = desktopEnabled;

  const apiRef = useRef(api);
  apiRef.current = api;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationsApi.list(apiRef.current);
      dispatch({ kind: 'hydrate', data });
    } catch {
      // silencioso: sin team/permiso todavía
    } finally {
      setLoading(false);
    }
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? '1' : '0');
    } catch {
      // no-op
    }
  }, []);

  const setDesktopEnabled = useCallback(async (v: boolean) => {
    if (v) {
      if (typeof Notification === 'undefined') return;
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      const ok = perm === 'granted';
      setDesktopEnabledState(ok);
      try {
        localStorage.setItem(DESKTOP_KEY, ok ? '1' : '0');
      } catch {
        // no-op
      }
      return;
    }
    setDesktopEnabledState(false);
    try {
      localStorage.setItem(DESKTOP_KEY, '0');
    } catch {
      // no-op
    }
  }, []);

  const desktopNotify = useCallback(
    (item: NotificationItem) => {
      if (!desktopRef.current) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!document.hidden) return; // sólo cuando la pestaña no está al frente
      try {
        const n = new Notification(item.title ?? 'Nuevo mensaje', {
          body: item.body ?? '',
          tag: `massivo:${item.conversationId}`,
        });
        n.onclick = () => {
          window.focus();
          navigate(`/dashboard/inbox?c=${item.conversationId}`);
          n.close();
        };
      } catch {
        // no-op
      }
    },
    [navigate],
  );

  const markRead = useCallback(async (id: string) => {
    dispatch({ kind: 'read', ev: { id } });
    try {
      await notificationsApi.markRead(apiRef.current, id);
    } catch {
      // no-op (el socket / refresh re-sincroniza)
    }
  }, []);

  const markAllRead = useCallback(async (bucket: 'mine' | 'unassigned' | 'all' = 'all') => {
    if (bucket === 'all' || bucket === 'mine') dispatch({ kind: 'readAll', ev: { bucket: 'mine' } });
    if (bucket === 'all' || bucket === 'unassigned') dispatch({ kind: 'readAll', ev: { bucket: 'unassigned' } });
    try {
      await notificationsApi.markAllRead(apiRef.current, bucket);
    } catch {
      // no-op
    }
  }, []);

  // Suscripción al socket + hidratación.
  useEffect(() => {
    if (!socket) {
      dispatch({ kind: 'reset' });
      return;
    }
    void refresh();

    const onConnect = () => void refresh();
    const onNew = (item: NotificationItem) => {
      dispatch({ kind: 'new', item });
      if (soundRef.current) playNotificationSound();
      desktopNotify(item);
    };
    const onRead = (ev: NotificationReadEvent) => dispatch({ kind: 'read', ev });
    const onReadAll = (ev: NotificationReadAllEvent) => dispatch({ kind: 'readAll', ev });

    socket.on('connect', onConnect);
    socket.on('notification.new', onNew);
    socket.on('notification.read', onRead);
    socket.on('notification.readAll', onReadAll);
    return () => {
      socket.off('connect', onConnect);
      socket.off('notification.new', onNew);
      socket.off('notification.read', onRead);
      socket.off('notification.readAll', onReadAll);
    };
  }, [socket, refresh, desktopNotify]);

  const totalUnread = state.mineUnread + state.unassignedUnread;

  // Contador en el título de la pestaña.
  const baseTitleRef = useRef<string>(document.title.replace(/^\(\d+\)\s*/, ''));
  useEffect(() => {
    const base = baseTitleRef.current;
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      mine: state.mine,
      unassigned: state.unassigned,
      mineUnread: state.mineUnread,
      unassignedUnread: state.unassignedUnread,
      totalUnread,
      loading,
      refresh,
      markRead,
      markAllRead,
      soundEnabled,
      setSoundEnabled,
      desktopEnabled,
      setDesktopEnabled,
    }),
    [
      state,
      totalUnread,
      loading,
      refresh,
      markRead,
      markAllRead,
      soundEnabled,
      setSoundEnabled,
      desktopEnabled,
      setDesktopEnabled,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
