import type { Samenvatting, Uur, KlantRegel, FunctieRegel } from './types';

/**
 * Totaal aantal uren en bedrag per klant > project > functie (+ tarief) voor een selectie uren.
 * Zelfde logica als api/src/lib/samenvatting.ts.
 */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cmp = (a: string, b: string) => a.localeCompare(b, 'nl');

export function maakSamenvatting(regels: Uur[]): Samenvatting {
  const klanten = new Map<number, KlantRegel>();
  const functies = new Map<string, FunctieRegel>();

  for (const r of regels) {
    const tarief = r.uurTarief ?? 0;
    const bedrag = r.bedrag ?? 0;
    let klant = klanten.get(r.klantId);
    if (!klant) {
      klant = { klantId: r.klantId, klantNaam: r.klantNaam, uren: 0, bedrag: 0, projecten: [] };
      klanten.set(r.klantId, klant);
    }
    let project = klant.projecten.find((p) => p.projectId === r.projectId);
    if (!project) {
      project = { projectId: r.projectId, projectCode: r.projectCode, projectNaam: r.projectNaam, uren: 0, bedrag: 0, functies: [] };
      klant.projecten.push(project);
    }
    const key = `${r.projectId}|${r.functieId}|${tarief}`;
    let functie = functies.get(key);
    if (!functie) {
      functie = { functieId: r.functieId, functieNaam: r.functieNaam, uurTarief: tarief, uren: 0, bedrag: 0 };
      functies.set(key, functie);
      project.functies.push(functie);
    }
    functie.uren = r2(functie.uren + r.aantal);
    functie.bedrag = r2(functie.bedrag + bedrag);
    project.uren = r2(project.uren + r.aantal);
    project.bedrag = r2(project.bedrag + bedrag);
    klant.uren = r2(klant.uren + r.aantal);
    klant.bedrag = r2(klant.bedrag + bedrag);
  }

  const lijst = [...klanten.values()].sort((a, b) => cmp(a.klantNaam, b.klantNaam));
  for (const k of lijst) {
    k.projecten.sort((a, b) => cmp(a.projectNaam, b.projectNaam));
    for (const p of k.projecten) {
      p.functies.sort((a, b) => cmp(a.functieNaam, b.functieNaam) || a.uurTarief - b.uurTarief);
    }
  }
  return {
    klanten: lijst,
    totaalUren: r2(lijst.reduce((s, k) => s + k.uren, 0)),
    totaalBedrag: r2(lijst.reduce((s, k) => s + k.bedrag, 0)),
    aantalRegels: regels.length,
  };
}
