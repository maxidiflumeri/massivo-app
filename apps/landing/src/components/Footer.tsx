import { brand } from '@/lib/brand';

export function Footer() {
  const year = 2026;

  return (
    <footer className="border-t border-white/5 py-12">
      <div className="container-narrow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-display font-semibold tracking-tight">
          <span className="inline-flex items-center justify-center size-7 rounded-md logo-tile">
            <svg viewBox="0 0 24 24" className="size-4 fill-white" aria-hidden>
              <path d="M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
            </svg>
          </span>
          <span>{brand.name}</span>
        </div>

        <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-neutral-400">
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
            href={brand.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition"
          >
            Documentación
          </a>
          <a href={`mailto:${brand.supportEmail}`} className="hover:text-white transition">
            Contacto
          </a>
        </div>

        <p className="text-xs text-neutral-500">© {year} {brand.name}. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
