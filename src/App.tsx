import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import { Spinner, ToastProvider, PageHead, Content } from './components/ui';
import { api, ApiError, setWakingListener } from './lib/api';
import { Link, navigate, useLocation } from './lib/router';
import type { Me } from './lib/types';
import Dashboard from './pages/Dashboard';
import Facturatie from './pages/Facturatie';
import Instellingen from './pages/Instellingen';
import KlantDetail from './pages/KlantDetail';
import Klanten from './pages/Klanten';
import Projecten from './pages/Projecten';
import Uren from './pages/Uren';

type State =
  | { kind: 'laden' }
  | { kind: 'ok'; me: Me }
  | { kind: 'geenToegang'; message: string }
  | { kind: 'fout'; message: string };

function Pagina({ me }: { me: Me }) {
  const { path } = useLocation();

  // Medewerkers hebben alleen toegang tot "Mijn uren".
  useEffect(() => {
    if (me.rol !== 'Admin' && path !== '/uren') navigate('/uren', true);
  }, [me.rol, path]);
  if (me.rol !== 'Admin') return <Uren me={me} />;

  const klantMatch = path.match(/^\/klanten\/(\d+)$/);
  if (path === '/') return <Dashboard />;
  if (path === '/uren') return <Uren me={me} />;
  if (path === '/facturatie') return <Facturatie />;
  if (path === '/klanten') return <Klanten />;
  if (klantMatch) return <KlantDetail id={Number(klantMatch[1])} />;
  if (path === '/projecten') return <Projecten />;
  if (path === '/instellingen') return <Instellingen me={me} />;
  return (
    <>
      <PageHead title="Pagina niet gevonden" />
      <Content><p>Deze pagina bestaat niet. <Link to="/" className="link">Terug naar het dashboard</Link></p></Content>
    </>
  );
}

function Root() {
  const [state, setState] = useState<State>({ kind: 'laden' });
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    setWakingListener(setWaking);
    api.get<Me>('/me').then(
      (me) => setState({ kind: 'ok', me }),
      (e: unknown) => {
        if (e instanceof ApiError && e.status === 403) setState({ kind: 'geenToegang', message: e.message });
        else setState({ kind: 'fout', message: e instanceof Error ? e.message : 'Er ging iets mis.' });
      },
    );
    return () => setWakingListener(null);
  }, []);

  if (state.kind === 'laden') {
    return (
      <div className="center-screen">
        <Spinner label={waking ? 'De database wordt opgestart, een moment geduld…' : 'Aanmelden…'} />
      </div>
    );
  }
  if (state.kind === 'geenToegang' || state.kind === 'fout') {
    return (
      <div className="center-screen">
        <div className="notice">
          <img src="/apu-logo.svg" alt="APu Consultancy" className="brand-logo" />
          <h1>{state.kind === 'geenToegang' ? 'Geen toegang' : 'Er ging iets mis'}</h1>
          <p>{state.message}</p>
          <div className="form-actions left">
            {state.kind === 'fout' && <button type="button" className="btn primary" onClick={() => window.location.reload()}>Opnieuw proberen</button>}
            <a className="btn" href="/.auth/logout?post_logout_redirect_uri=/afgemeld.html">Uitloggen</a>
          </div>
        </div>
      </div>
    );
  }
  return (
    <Layout me={state.me} waking={waking}>
      <Pagina me={state.me} />
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}
