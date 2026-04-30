import { useAuth } from '@clerk/clerk-react';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useActiveTeam } from '../team/TeamContext';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Conecta a backend socket con `auth: { token, teamId }` y se une a los rooms
 * del team. Token se obtiene de Clerk en cada conexión; al expirar, el backend
 * cierra el socket y este hook reconecta con un token fresco.
 *
 * Devuelve `socket | null`. Llamadas a `socket.on(event, ...)` deben hacerse
 * dentro de useEffect del componente que las consume.
 */
export function useTeamSocket(): Socket | null {
  const { getToken, isSignedIn } = useAuth();
  const { activeTeamId } = useActiveTeam();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isSignedIn || !activeTeamId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (cancelled || !token) return;
      const s = io(SOCKET_URL, {
        auth: { token, teamId: activeTeamId },
        transports: ['websocket'],
        autoConnect: true,
      });
      socketRef.current = s;
      setSocket(s);
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [isSignedIn, activeTeamId, getToken]);

  return socket;
}
