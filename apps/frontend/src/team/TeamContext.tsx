import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';

const STORAGE_KEY = 'massivo:activeTeamId';
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';

interface TeamContextValue {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

type MeContext = {
  organizations?: Array<{
    clerkOrgId: string;
    teams?: Array<{ id: string }>;
  }>;
};

export function TeamProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const { organization } = useOrganization();
  const clerkOrgId = organization?.id ?? null;

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

  // Bootstrap + watcher de cambio de organización Clerk.
  //
  // Caso 1 (bootstrap): user recién logueado, no hay activeTeamId en storage.
  //   → /api/me/context, primer team del primer org disponible.
  //
  // Caso 2 (org switch): user cambia de organización activa en Clerk. El
  //   localStorage tiene un team de la org vieja → backend devuelve 403 ("el
  //   team no pertenece a esta organización"). Detectamos el cambio de
  //   clerkOrgId y re-derivamos un team válido del org nuevo.
  const lastClerkOrgIdRef = useRef<string | null>(clerkOrgId);
  useEffect(() => {
    if (!isSignedIn) return;

    const clerkOrgChanged = clerkOrgId !== lastClerkOrgIdRef.current;
    const needBootstrap = !activeTeamId;
    if (!clerkOrgChanged && !needBootstrap) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(`${API_BASE}/api/me/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as MeContext;

        // Si Clerk reporta un org activo, priorizá el team de ESE org.
        // Si no, fallback al primer team disponible (bootstrap inicial).
        const targetOrg = clerkOrgId
          ? data.organizations?.find((o) => o.clerkOrgId === clerkOrgId)
          : data.organizations?.[0];
        const nextTeamId = targetOrg?.teams?.[0]?.id ?? null;

        if (cancelled) return;
        if (nextTeamId) {
          setActiveTeamId(nextTeamId);
        } else if (clerkOrgChanged) {
          // Org cambió pero aún no hay team local para ese org (el webhook
          // organization.created todavía no se procesó). Limpiamos el storage
          // para evitar el 403 y la app va a mostrar un estado "sin team".
          setActiveTeamId(null);
        }
        lastClerkOrgIdRef.current = clerkOrgId;
      } catch {
        // Silencioso a propósito: 401 / red / etc. el resto de la app va a
        // mostrar el error real cuando intente llamar a la API.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, clerkOrgId, activeTeamId, getToken, setActiveTeamId]);

  return (
    <TeamContext.Provider value={{ activeTeamId, setActiveTeamId }}>{children}</TeamContext.Provider>
  );
}

export function useActiveTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useActiveTeam must be used within TeamProvider');
  return ctx;
}
