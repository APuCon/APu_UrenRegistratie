import { useMemo, useState } from 'react';
import KlantForm from '../components/KlantForm';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { Link, navigate } from '../lib/router';
import type { Klant } from '../lib/types';
import { Content, Empty, ErrorBox, Modal, PageHead, Pill, Spinner } from '../components/ui';

export default function Klanten() {
  const d = useAsync(() => api.get<Klant[]>('/klanten'), []);
  const [zoek, setZoek] = useState('');
  const [toonInactief, setToonInactief] = useState(false);
  const [nieuw, setNieuw] = useState(false);

  const rijen = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return (d.data ?? []).filter(
      (k) => (toonInactief || k.actief) && (!z || `${k.naam} ${k.contactpersoon ?? ''} ${k.plaats ?? ''}`.toLowerCase().includes(z)),
    );
  }, [d.data, zoek, toonInactief]);

  return (
    <>
      <PageHead eyebrow="Stamgegevens" title="Klanten" sub="Beheer je klanten en stel per klant de uurtarieven per functie in.">
        <button type="button" className="btn primary" onClick={() => setNieuw(true)}>Nieuwe klant <span aria-hidden="true">＋</span></button>
      </PageHead>
      <Content>
        <div className="filters">
          <label className="inline-field grow">
            <span>Zoeken</span>
            <input type="search" placeholder="Naam, contactpersoon of plaats" value={zoek} onChange={(e) => setZoek(e.target.value)} />
          </label>
          <label className="check-field">
            <input type="checkbox" checked={toonInactief} onChange={(e) => setToonInactief(e.target.checked)} />
            <span>Toon niet-actieve klanten</span>
          </label>
        </div>
        {d.error && <ErrorBox message={d.error} onRetry={d.reload} />}
        {d.loading && !d.data && <Spinner />}
        {d.data && rijen.length === 0 && <Empty>{d.data.length === 0 ? 'Nog geen klanten. Maak je eerste klant aan.' : 'Geen klanten gevonden.'}</Empty>}
        {rijen.length > 0 && (
          <div className="table-wrap">
            <table className="data clickable">
              <thead>
                <tr><th>Klant</th><th>Contactpersoon</th><th>Plaats</th><th className="num">Actieve projecten</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rijen.map((k) => (
                  <tr key={k.klantId} onClick={() => navigate(`/klanten/${k.klantId}`)}>
                    <td><strong>{k.naam}</strong></td>
                    <td>{k.contactpersoon}</td>
                    <td>{k.plaats}</td>
                    <td className="num">{k.actieveProjecten}</td>
                    <td><Pill tone={k.actief ? 'actief' : 'inactief'}>{k.actief ? 'Actief' : 'Niet actief'}</Pill></td>
                    <td className="actions"><Link to={`/klanten/${k.klantId}`} className="link">Openen →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Content>
      {nieuw && (
        <Modal title="Nieuwe klant" onClose={() => setNieuw(false)} wide>
          <KlantForm onCancel={() => setNieuw(false)} onSaved={(k) => { setNieuw(false); navigate(`/klanten/${k.klantId}`); }} />
        </Modal>
      )}
    </>
  );
}
