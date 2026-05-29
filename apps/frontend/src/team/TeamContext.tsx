import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';

const STORAGE_KEY = 'massivo:activeTeamId';
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';

interface TeamContextValue {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [activeTeamId, setState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const setActiveTeamId = useCallback((teamId: string | null) => {
    setState(teamId);
    if (teamId) window.localStorage.setItem(STORAGE_KEY, teamId);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Sync cross-tab: si cambiás de team en otra pestaña, se replica acá.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(e.newValue);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Bootstrap automático: cuando el user esta signed-in y NO hay activeTeamId
  // guardado, derivamos el primer team del primer org desde /api/me/context.
  // Sin esto, el primer login post-signup tira "Falta header X-Team-Id" en
  // cada llamada hasta que alguien (vos en devtools) seteás localStorage.
  useEffect(() => {
    if (!isSignedIn || activeTeamId) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(`${API_BASE}/api/me/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;

        const data: {
          organizations?: Array<{ teams?: Array<{ id: string }> }>;
        } = await res.json();
        const firstTeamId = data.organizations?.[0]?.teams?.[0]?.id;
        if (firstTeamId && !cancelled) setActiveTeamId(firstTeamId);
      } catch {
        // Silencioso: si /me/context falla, el resto de la app va a mostrar el
        // error real (401, network, etc.) — no metemos ruido extra acá.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, activeTeamId, getToken, setActiveTeamId]);

  return (
    <TeamContext.Provider value={{ activeTeamId, setActiveTeamId }}>{children}</TeamContext.Provider>
  );
}

export function useActiveTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useActiveTeam must be used within TeamProvider');
  return ctx;
}
