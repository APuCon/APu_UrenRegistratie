import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakSamenvatting, UurRegel } from '../src/lib/samenvatting';
import { parseDate, reqDecimal } from '../src/lib/validate';

const regel = (o: Partial<UurRegel>): UurRegel => ({
  klantId: 1, klantNaam: 'Acme', projectId: 10, projectCode: 'A-1', projectNaam: 'Migratie',
  functieId: 100, functieNaam: 'Consultant', aantal: 1, uurTarief: 100, bedrag: 100, ...o,
});

test('totaliseert per klant, project en functie', () => {
  const s = maakSamenvatting([
    regel({ aantal: 8, bedrag: 800 }),
    regel({ aantal: 4, bedrag: 400 }),
    regel({ functieId: 101, functieNaam: 'Senior', aantal: 2, uurTarief: 150, bedrag: 300 }),
    regel({ projectId: 11, projectNaam: 'Audit', aantal: 1.5, bedrag: 150 }),
    regel({ klantId: 2, klantNaam: 'Beta', projectId: 20, projectNaam: 'Advies', aantal: 3, uurTarief: 90, bedrag: 270 }),
  ]);
  assert.equal(s.aantalRegels, 5);
  assert.equal(s.totaalUren, 18.5);
  assert.equal(s.totaalBedrag, 1920);
  assert.equal(s.klanten.length, 2);
  const acme = s.klanten[0];
  assert.equal(acme.klantNaam, 'Acme');
  assert.equal(acme.uren, 15.5);
  assert.equal(acme.bedrag, 1650);
  const migratie = acme.projecten.find((p) => p.projectId === 10)!;
  assert.equal(migratie.functies.length, 2);
  assert.deepEqual(migratie.functies.map((f) => [f.functieNaam, f.uren, f.bedrag]), [
    ['Consultant', 12, 1200],
    ['Senior', 2, 300],
  ]);
});

test('een tariefwijziging binnen dezelfde functie blijft als aparte regel zichtbaar', () => {
  const s = maakSamenvatting([
    regel({ aantal: 1, uurTarief: 100, bedrag: 100 }),
    regel({ aantal: 1, uurTarief: 110, bedrag: 110 }),
  ]);
  const functies = s.klanten[0].projecten[0].functies;
  assert.equal(functies.length, 2);
  assert.equal(s.totaalBedrag, 210);
});

test('vermijdt drijvende-komma-afwijkingen', () => {
  const regels = Array.from({ length: 10 }, () => regel({ aantal: 0.1, uurTarief: 0.1, bedrag: 0.01 }));
  const s = maakSamenvatting(regels);
  assert.equal(s.totaalUren, 1);
  assert.equal(s.totaalBedrag, 0.1);
});

test('lege selectie geeft nul-totalen', () => {
  const s = maakSamenvatting([]);
  assert.deepEqual([s.totaalUren, s.totaalBedrag, s.klanten.length], [0, 0, 0]);
});

test('datumvalidatie', () => {
  assert.equal(parseDate('2026-02-28', 'x'), '2026-02-28');
  assert.throws(() => parseDate('2026-02-30', 'x'));
  assert.throws(() => parseDate('28-02-2026', 'x'));
});

test('decimalen: komma wordt geaccepteerd en afgerond op 2 decimalen', () => {
  assert.equal(reqDecimal({ a: '7,5' }, 'a', 'Uren', 0.01, 24), 7.5);
  assert.equal(reqDecimal({ a: 1.005 }, 'a', 'Uren', 0.01, 24), 1);
  assert.throws(() => reqDecimal({ a: 25 }, 'a', 'Uren', 0.01, 24));
  assert.throws(() => reqDecimal({}, 'a', 'Uren', 0.01, 24));
});
