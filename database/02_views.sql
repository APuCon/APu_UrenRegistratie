/* =====================================================================
   APu Urenregistratie - 02_views.sql
   Rapportage-views voor Power BI (schema [rapportage]).
   Power BI krijgt ALLEEN leesrechten op dit schema (zie 03_gebruikers.sql),
   nooit rechtstreeks op de tabellen in dbo.
   Model in Power BI (sterschema):
     vw_Uren (feiten)  --> vw_Klant, vw_Project, vw_Functie, vw_Medewerker, vw_Facturatie
   ===================================================================== */

IF SCHEMA_ID(N'rapportage') IS NULL
    EXEC (N'CREATE SCHEMA rapportage AUTHORIZATION dbo');
GO

/* ---------- Feitentabel: 1 rij per geregistreerd uur ---------- */
CREATE OR ALTER VIEW rapportage.vw_Uren AS
SELECT
    u.UurId,
    u.Datum,
    YEAR(u.Datum)                       AS Jaar,
    MONTH(u.Datum)                      AS Maand,
    DATEPART(ISO_WEEK, u.Datum)         AS Weeknummer,
    k.KlantId,
    k.Naam                              AS Klant,
    p.ProjectId,
    p.Code                              AS ProjectCode,
    p.Naam                              AS Project,
    f.FunctieId,
    f.Naam                              AS Functie,
    m.MedewerkerId,
    m.Naam                              AS Medewerker,
    u.Aantal                            AS Uren,
    u.UurTarief,
    u.Bedrag,
    CASE WHEN u.FacturatieId IS NULL THEN N'Niet gefactureerd' ELSE N'Gefactureerd' END AS FactuurStatus,
    CAST(CASE WHEN u.FacturatieId IS NULL THEN 0 ELSE 1 END AS BIT)                    AS IsGefactureerd,
    CASE WHEN u.FacturatieId IS NULL THEN 0 ELSE u.Aantal END                          AS UrenGefactureerd,
    CASE WHEN u.FacturatieId IS NULL THEN u.Aantal ELSE 0 END                          AS UrenNietGefactureerd,
    CASE WHEN u.FacturatieId IS NULL THEN CAST(0 AS DECIMAL(12,2)) ELSE u.Bedrag END   AS BedragGefactureerd,
    CASE WHEN u.FacturatieId IS NULL THEN u.Bedrag ELSE CAST(0 AS DECIMAL(12,2)) END   AS BedragNietGefactureerd,
    u.FacturatieId,
    fa.FactuurDatum,
    fa.Referentie                       AS FactuurReferentie,
    u.Omschrijving
FROM dbo.Uur u
JOIN dbo.Project    p  ON p.ProjectId    = u.ProjectId
JOIN dbo.Klant      k  ON k.KlantId      = p.KlantId
JOIN dbo.Functie    f  ON f.FunctieId    = u.FunctieId
JOIN dbo.Medewerker m  ON m.MedewerkerId = u.MedewerkerId
LEFT JOIN dbo.Facturatie fa ON fa.FacturatieId = u.FacturatieId;
GO

/* ---------- Samenvatting per klant en project (dashboard-gegevens) ---------- */
CREATE OR ALTER VIEW rapportage.vw_FacturatiePerProject AS
SELECT
    k.KlantId,
    k.Naam                              AS Klant,
    p.ProjectId,
    p.Code                              AS ProjectCode,
    p.Naam                              AS Project,
    p.Status                            AS ProjectStatus,
    CAST(COALESCE(SUM(CASE WHEN u.FacturatieId IS NOT NULL THEN u.Aantal END), 0) AS DECIMAL(12,2)) AS UrenGefactureerd,
    CAST(COALESCE(SUM(CASE WHEN u.FacturatieId IS NULL     THEN u.Aantal END), 0) AS DECIMAL(12,2)) AS UrenNietGefactureerd,
    CAST(COALESCE(SUM(CASE WHEN u.FacturatieId IS NOT NULL THEN u.Bedrag END), 0) AS DECIMAL(14,2)) AS BedragGefactureerd,
    CAST(COALESCE(SUM(CASE WHEN u.FacturatieId IS NULL     THEN u.Bedrag END), 0) AS DECIMAL(14,2)) AS BedragNietGefactureerd,
    CAST(COALESCE(SUM(u.Aantal), 0) AS DECIMAL(12,2))                                               AS UrenTotaal,
    CAST(COALESCE(SUM(u.Bedrag), 0) AS DECIMAL(14,2))                                               AS BedragTotaal
FROM dbo.Project p
JOIN dbo.Klant k ON k.KlantId = p.KlantId
LEFT JOIN dbo.Uur u ON u.ProjectId = p.ProjectId
GROUP BY k.KlantId, k.Naam, p.ProjectId, p.Code, p.Naam, p.Status;
GO

/* ---------- Dimensietabellen ---------- */
CREATE OR ALTER VIEW rapportage.vw_Klant AS
SELECT KlantId, Naam AS Klant, Contactpersoon, Email, Plaats, KvkNummer, BtwNummer,
       CAST(Actief AS BIT) AS Actief
FROM dbo.Klant;
GO

CREATE OR ALTER VIEW rapportage.vw_Project AS
SELECT p.ProjectId, p.KlantId, p.Code AS ProjectCode, p.Naam AS Project, p.Status AS ProjectStatus,
       p.StartDatum, p.EindDatum
FROM dbo.Project p;
GO

CREATE OR ALTER VIEW rapportage.vw_Functie AS
SELECT FunctieId, Naam AS Functie, CAST(Actief AS BIT) AS Actief
FROM dbo.Functie;
GO

/* Bewust zonder e-mailadres: alleen wat nodig is voor rapportage. */
CREATE OR ALTER VIEW rapportage.vw_Medewerker AS
SELECT MedewerkerId, Naam AS Medewerker, Rol, CAST(Actief AS BIT) AS Actief
FROM dbo.Medewerker;
GO

CREATE OR ALTER VIEW rapportage.vw_Tarief AS
SELECT t.TariefId, t.KlantId, k.Naam AS Klant, t.FunctieId, f.Naam AS Functie,
       t.UurTarief, t.GeldigVanaf,
       -- GeldigTot: dag voor de volgende ingangsdatum van dezelfde klant+functie
       (SELECT DATEADD(DAY, -1, MIN(t2.GeldigVanaf))
          FROM dbo.Tarief t2
         WHERE t2.KlantId = t.KlantId AND t2.FunctieId = t.FunctieId AND t2.GeldigVanaf > t.GeldigVanaf) AS GeldigTot
FROM dbo.Tarief t
JOIN dbo.Klant   k ON k.KlantId   = t.KlantId
JOIN dbo.Functie f ON f.FunctieId = t.FunctieId;
GO

CREATE OR ALTER VIEW rapportage.vw_Facturatie AS
SELECT fa.FacturatieId, fa.KlantId, k.Naam AS Klant, fa.Referentie, fa.FactuurDatum,
       fa.TotaalUren, fa.TotaalBedrag, fa.Opmerking, fa.AangemaaktDoor, fa.AangemaaktOp
FROM dbo.Facturatie fa
JOIN dbo.Klant k ON k.KlantId = fa.KlantId;
GO
