// Typen die overeenkomen met de JSON die de API teruggeeft.

export type Rol = 'Admin' | 'Medewerker';

export interface Me {
  medewerkerId: number;
  email: string;
  naam: string;
  rol: Rol;
  standaardFunctieId: number | null;
}

export interface Klant {
  klantId: number;
  naam: string;
  contactpersoon: string | null;
  email: string | null;
  telefoon: string | null;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  kvkNummer: string | null;
  btwNummer: string | null;
  notities: string | null;
  actief: boolean;
  actieveProjecten: number;
}

export interface Functie {
  functieId: number;
  naam: string;
  actief: boolean;
}

export interface Tarief {
  tariefId: number;
  klantId: number;
  functieId: number;
  functieNaam: string;
  uurTarief: number;
  geldigVanaf: string;
  aantalUren: number;
}

export type ProjectStatus = 'Actief' | 'Afgerond' | 'Gearchiveerd';

export interface Project {
  projectId: number;
  klantId: number;
  klantNaam: string;
  code: string | null;
  naam: string;
  omschrijving: string | null;
  status: ProjectStatus;
  startDatum: string | null;
  eindDatum: string | null;
  aantalUren: number;
}

export interface Medewerker {
  medewerkerId: number;
  email: string;
  naam: string;
  rol: Rol;
  standaardFunctieId: number | null;
  standaardFunctieNaam: string | null;
  actief: boolean;
}

export interface UrenOpties {
  standaardFunctieId: number | null;
  projecten: {
    projectId: number;
    code: string | null;
    naam: string;
    klantId: number;
    klantNaam: string;
    functies: { functieId: number; naam: string }[];
  }[];
  medewerkers?: { medewerkerId: number; naam: string }[];
}

export interface Uur {
  uurId: number;
  datum: string;
  medewerkerId: number;
  medewerkerNaam: string;
  klantId: number;
  klantNaam: string;
  projectId: number;
  projectCode: string | null;
  projectNaam: string;
  functieId: number;
  functieNaam: string;
  aantal: number;
  /** null voor medewerkers: zij zien geen tarieven of bedragen */
  uurTarief: number | null;
  bedrag: number | null;
  omschrijving: string | null;
  facturatieId: number | null;
  factuurReferentie?: string | null;
  factuurDatum?: string | null;
}

export interface UrenResponse {
  uren: Uur[];
  afgekapt: boolean;
}

export interface Facturatie {
  facturatieId: number;
  klantId: number;
  klantNaam: string;
  referentie: string | null;
  factuurDatum: string;
  opmerking: string | null;
  totaalUren: number;
  totaalBedrag: number;
  aangemaaktDoor: string;
  aangemaaktOp: string;
  aantalRegels: number;
}

export interface FacturatieDetail extends Facturatie {
  regels: (Uur & { medewerkerNaam: string })[];
  samenvatting: Samenvatting;
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

export interface FacturatieResultaat {
  facturaties: Facturatie[];
  samenvatting: Samenvatting;
}

export interface Kengetallen {
  urenGefactureerd: number;
  urenOpen: number;
  bedragGefactureerd: number;
  bedragOpen: number;
}
export interface DashboardProject extends Kengetallen {
  projectId: number;
  projectCode: string | null;
  projectNaam: string;
  projectStatus: ProjectStatus;
}
export interface DashboardKlant extends Kengetallen {
  klantId: number;
  klantNaam: string;
  projecten: DashboardProject[];
}
export interface DashboardMaand extends Kengetallen {
  maand: string; // JJJJ-MM
}
export interface Dashboard {
  totalen: Kengetallen;
  klanten: DashboardKlant[];
  perMaand: DashboardMaand[];
  jaren: number[];
}
