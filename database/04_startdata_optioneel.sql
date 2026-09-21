/* =====================================================================
   APu Urenregistratie - 04_startdata_optioneel.sql
   Handig startpunt: een paar functies. Pas gerust aan of sla over -
   functies en tarieven beheer je ook in de app (Instellingen / Klanten).
   ===================================================================== */

INSERT INTO dbo.Functie (Naam)
SELECT v.Naam
FROM (VALUES (N'Consultant'), (N'Senior consultant'), (N'Projectmanager')) AS v(Naam)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Functie f WHERE f.Naam = v.Naam);
GO
