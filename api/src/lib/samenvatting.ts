/**
 * Facturatie-samenvatting: totaal aantal uren en bedrag per klant > project > functie (+ tarief).
 * Dezelfde logica staat in de frontend (src/lib/samenvatting.ts) voor de live samenvatting bij het selecteren.
 */
export interface UurRegel {
  klantId: number;
  klantNaam: string;
  projectId: number;
  projectCode: string | null;
  projectNaam: string;
  functieId: number;
  functieNaam: string;
  aantal: number;
  uurTarief: number;
  bedrag: number;
}

export interface FunctieRegel {
  functieId: number;
  functieNaam: string;
  uurTarief: number;
  uren: number;
  bedrag: number;
}
export interface ProjectRegel {
  projectId: number;
  projectCode: string | null;
  projectNaam: string;
  uren: number;
  bedrag: number;
  functies: FunctieRegel[];
}
export interface KlantRegel {
  klantId: number;
  klantNaam: string;
  uren: number;
  bedrag: number;
  projecten: ProjectRegel[];
}
export interface Samenvatting {
  klanten: KlantRegel[];
  totaalUren: number;
  totaalBedrag: number;
  aantalRegels: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function maakSamenvatting(regels: UurRegel[]): Samenvatting {
  const klanten = new Map<number, KlantRegel>();
  // sleutel: project + functie + tarief, zodat een tariefwijziging binnen de selectie als aparte regel zichtbaar blijft
  const functieKey = new Map<string, FunctieRegel>();

  for (const r of regels) {
    let klant = klanten.get(r.klantId);
    if (!klant) {
      klant = { klantId: r.klantId, klantNaam: r.klantNaam, uren: 0, bedrag: 0, projecten: [] };
      klanten.set(r.klantId, klant);
    }
    let project = klant.projecten.find((p) => p.projectId === r.projectId);
    if (!project) {
      project = {
        projectId: r.projectId,
        projectCode: r.projectCode,
        projectNaam: r.projectNaam,
        uren: 0,
        bedrag: 0,
        functies: [],
      };
      klant.projecten.push(project);
    }
    const key = `${r.projectId}|${r.functieId}|${r.uurTarief}`;
    let functie = functieKey.get(key);
    if (!functie) {
      functie = { functieId: r.functieId, functieNaam: r.functieNaam, uurTarief: r.uurTarief, uren: 0, bedrag: 0 };
      functieKey.set(key, functie);
      project.functies.push(functie);
    }
    functie.uren = r2(functie.uren + r.aantal);
    functie.bedrag = r2(functie.bedrag + r.bedrag);
    project.uren = r2(project.uren + r.aantal);
    project.bedrag = r2(project.bedrag + r.bedrag);
    klant.uren = r2(klant.uren + r.aantal);
    klant.bedrag = r2(klant.bedrag + r.bedrag);
  }

  const lijst = [...klanten.values()].sort((a, b) => a.klantNaam.localeCompare(b.klantNaam, 'nl'));
  for (const k of lijst) {
    k.projecten.sort((a, b) => a.projectNaam.localeCompare(b.projectNaam, 'nl'));
    for (const p of k.projecten) {
      p.functies.sort((a, b) => a.functieNaam.localeCompare(b.functieNaam, 'nl') || a.uurTarief - b.uurTarief);
    }
  }
  return {
    klanten: lijst,
    totaalUren: r2(lijst.reduce((s, k) => s + k.uren, 0)),
    totaalBedrag: r2(lijst.reduce((s, k) => s + k.bedrag, 0)),
    aantalRegels: regels.length,
  };
}
