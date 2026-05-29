// URL del panel — destino de los CTAs (logged-in y logged-out).
export const PANEL_URL =
  (import.meta.env.VITE_PANEL_URL as string | undefined) ?? 'https://panel.massivo.app';

// URL para signup directo (Clerk maneja el routing dentro del panel).
export const SIGNUP_URL = `${PANEL_URL}/sign-up`;
export const SIGNIN_URL = `${PANEL_URL}/sign-in`;
