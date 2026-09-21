/* =====================================================================
   APu Urenregistratie - 03_gebruikers.sql
   Twee database-gebruikers met minimale rechten:
     1. app_api         - gebruikt door de Azure Static Web Apps API
     2. powerbi_reader  - alleen SELECT op schema [rapportage] (Power BI)
   Uitvoeren op de Azure SQL Database (NIET op master), als beheerder.

   !! Vervang de wachtwoorden hieronder door lange, unieke wachtwoorden !!
   ===================================================================== */

/* ---------- 1. Gebruiker voor de API ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'app_api')
    CREATE USER app_api WITH PASSWORD = 'VERVANG-MIJ-app_api-Wachtwoord-1!';
GO
-- Lezen en schrijven in dbo. Geen rechten om tabellen te wijzigen of te verwijderen.
ALTER ROLE db_datareader ADD MEMBER app_api;
ALTER ROLE db_datawriter ADD MEMBER app_api;
GO

/* ---------- 2. Read-only gebruiker voor Power BI ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'powerbi_reader')
    CREATE USER powerbi_reader WITH PASSWORD = 'VERVANG-MIJ-powerbi-Wachtwoord-2!';
GO
GRANT SELECT ON SCHEMA::rapportage TO powerbi_reader;
DENY  SELECT ON SCHEMA::dbo        TO powerbi_reader;   -- geen toegang tot de brontabellen
GO

/* ---------- Optioneel (aanbevolen): Power BI met je Microsoft Entra-account ----------
   Zonder wachtwoord; toegang loopt via je eigen APu-account. Vereist dat op de
   SQL-server een Microsoft Entra-beheerder is ingesteld, en dat je dit script
   uitvoert als Entra-gebruiker (niet als SQL-login).

   CREATE USER [a.pullens@apuconsultancy.nl] FROM EXTERNAL PROVIDER;
   GRANT SELECT ON SCHEMA::rapportage TO [a.pullens@apuconsultancy.nl];
   ---------------------------------------------------------------------------------- */
