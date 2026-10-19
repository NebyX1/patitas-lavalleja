import { useEffect, useRef, useState } from 'react';
import { navigation } from '../../config/site';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
import { useSession } from '../../features/auth/store';
export default function MobileMenu() {
  const ready = useClientState();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const media = matchMedia('(min-width: 1061px)');
    const onResize = () => {
      if (media.matches) setOpen(false);
    };
    window.addEventListener('keydown', close);
    media.addEventListener('change', onResize);
    return () => {
      window.removeEventListener('keydown', close);
      media.removeEventListener('change', onResize);
    };
  }, [open]);
  return (
    <>
      <button
        disabled={!ready}
        ref={button}
        className="circle-button menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'close' : 'menu'} />
      </button>
      {open && (
        <nav
          className="mobile-menu"
          id="mobile-menu"
          aria-label="Navegación móvil"
        >
          {navigation.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          {session?.authenticated && (
            <a
              className="mobile-smart-search"
              href="/tu-match/"
              onClick={() => setOpen(false)}
            >
              <Icon name="spark" /> Búsqueda inteligente
            </a>
          )}
          <a href="/publicar/" onClick={() => setOpen(false)}>
            Dar en adopción <Icon name="plus" />
          </a>
          <a href="/privacidad/" onClick={() => setOpen(false)}>
            Tus datos
          </a>
          <a
            href={session?.authenticated ? '/cuenta/' : '/login/'}
            onClick={() => setOpen(false)}
          >
            {session?.authenticated && session.user
              ? `Mi cuenta · ${session.user.display_name.split('·')[0].trim()}`
              : 'Iniciar sesión'}
          </a>
          <a href="/admin/" onClick={() => setOpen(false)}>
            Panel de responsables
          </a>
        </nav>
      )}
    </>
  );
}
