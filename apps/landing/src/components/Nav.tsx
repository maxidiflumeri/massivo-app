import { useUser } from '@clerk/clerk-react';
import { ArrowRight } from 'lucide-react';
import { PANEL_URL, SIGNUP_URL } from '@/lib/config';
import { cn } from '@/lib/cn';

function LogoTile() {
  return (
    <span className="inline-flex items-center justify-center size-7 rounded-md logo-tile">
      <svg viewBox="0 0 24 24" className="size-4 fill-white" aria-hidden>
        <path d="M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
      </svg>
    </span>
  );
}

export function Nav() {
  const { isSignedIn, user, isLoaded } = useUser();

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-neutral-950/60 border-b border-white/5">
      <div className="container-narrow flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2 font-display font-semibold tracking-tight">
          <LogoTile />
          <span className="text-lg">Massivo</span>
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm text-neutral-300">
          <a href="#features" className="hover:text-white transition">
            Producto
          </a>
          <a href="#how-it-works" className="hover:text-white transition">
            Cómo funciona
          </a>
          <a href="#plans" className="hover:text-white transition">
            Planes
          </a>
          <a
            href="https://docs.massivo.app"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition"
          >
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {!isLoaded ? (
            <div className="h-9 w-32 rounded-md bg-white/5 animate-pulse" />
          ) : isSignedIn ? (
            <>
              <a
                href={PANEL_URL}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-4 h-9 text-sm font-medium',
                  'bg-brand-500 text-white hover:bg-brand-600 transition',
                )}
              >
                Ir al panel
                <ArrowRight className="size-4" strokeWidth={2.5} />
              </a>
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.fullName ?? 'avatar'}
                    className="size-8 rounded-full ring-1 ring-white/10"
                  />
                ) : (
                  <div className="size-8 rounded-full bg-white/10 grid place-items-center text-xs text-neutral-300">
                    {user?.firstName?.[0] ?? 'M'}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <a
                href={`${PANEL_URL}/sign-in`}
                className="hidden sm:inline-flex items-center text-sm text-neutral-300 hover:text-white transition h-9 px-3"
              >
                Iniciar sesión
              </a>
              <a
                href={SIGNUP_URL}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-4 h-9 text-sm font-medium',
                  'bg-brand-500 text-white hover:bg-brand-600 transition shadow-lg shadow-brand-500/30',
                )}
              >
                Probar gratis
                <ArrowRight className="size-4" strokeWidth={2.5} />
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
