import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from '../lib/router';
import type { Me } from '../lib/types';

const ADMIN_MENU = [
  { to: '/', label: 'Dashboard' },
  { to: '/uren', label: 'Uren' },
  { to: '/facturatie', label: 'Facturatie' },
  { to: '/klanten', label: 'Klanten' },
  { to: '/projecten', label: 'Projecten' },
  { to: '/instellingen', label: 'Instellingen' },
];
const MEDEWERKER_MENU = [{ to: '/uren', label: 'Mijn uren' }];

/** Kop en voet in dezelfde stijl als de APu Consultancy-website. */
export default function Layout({ me, waking, children }: { me: Me; waking: boolean; children: ReactNode }) {
  const { path } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = me.rol === 'Admin' ? ADMIN_MENU : MEDEWERKER_MENU;
  const actief = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

  useEffect(() => setMenuOpen(false), [path]);

  return (
    <div className="app">
      <a className="skip" href="#inhoud">Naar de inhoud</a>
      <header className="header">
        <div className="container nav">
          <Link to={me.rol === 'Admin' ? '/' : '/uren'} className="brand" title="APu Consultancy">
            <img src="/apu-logo.svg" alt="APu Consultancy" className="brand-logo" />
            <span className="brand-sub">Urenregistratie</span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="hoofdmenu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? '✕' : '☰'}<span className="sr-only"> Menu</span>
          </button>
          <nav id="hoofdmenu" className={menuOpen ? 'open' : ''} aria-label="Hoofdmenu">
            {menu.map((m) => (
              <Link key={m.to} to={m.to} className={actief(m.to) ? 'active' : ''}>
                {m.label}
              </Link>
            ))}
            <span className="nav-user" title={me.email}>
              {me.naam}
              <small>{me.rol === 'Admin' ? 'Beheerder' : 'Medewerker'}</small>
            </span>
            <a className="nav-contact" href="/.auth/logout?post_logout_redirect_uri=/afgemeld.html">
              Uitloggen <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </div>
      </header>

      <main id="inhoud">
        {waking && (
          <div className="container">
            <div className="alert warn wake" role="status">
              De database wordt opgestart na een periode van inactiviteit. Dit duurt maximaal een minuut…
            </div>
          </div>
        )}
        {children}
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>© {new Date().getFullYear()} APu Consultancy · Urenregistratie</span>
          
        </div>
      </footer>
    </div>
  );
}
