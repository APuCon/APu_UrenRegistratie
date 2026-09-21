# APu Urenregistratie

Urenregistratie voor APu Consultancy op **Azure Static Web Apps** (React + Vite + TypeScript, met een ingebouwde Azure Functions-API in Node 20) en **Azure SQL Database**. Inloggen gaat via je Microsoft Entra-omgeving (APu-domein). Power BI leest read-only mee via rapportage-views.

## Wat kan de app?

| Onderdeel | Beheerder | Medewerker |
|---|---|---|
| Uren registreren, wijzigen, verwijderen | alle uren | alleen eigen uren |
| Klanten en tarieven (per klant + functie, met ingangsdatum) | aanmaken en wijzigen | geen toegang, ziet nooit tarieven of bedragen |
| Projecten | aanmaken en wijzigen | geen toegang |
| Facturatie: uren omzetten van *niet gefactureerd* naar *gefactureerd* | ja, met overzicht per project en functie (uren + bedrag) bij het selecteren; terugdraaien mogelijk | geen toegang |
| Dashboard per klant en project (gefactureerd vs. nog te factureren) | ja | geen toegang |
| Medewerkers en functies beheren | ja | geen toegang |

Het tarief wordt bij het registreren vastgelegd (snapshot). Een latere tariefwijziging verandert dus geen uren die al gefactureerd zijn. Nog niet gefactureerde uren kun je bij een tariefwijziging laten herberekenen.

## Inhoud van dit project

```
database/            SQL-scripts (01 schema, 02 rapportage-views, 03 gebruikers, 04 optionele startdata)
api/                 Azure Functions (TypeScript) = de backend van de Static Web App
src/  public/        React-frontend en statische bestanden (incl. staticwebapp.config.json)
powerbi/             Power Query (M) en DAX-maatstaven voor Power BI
.github/workflows/   GitHub Actions-workflow voor automatisch uitrollen
```

## Belangrijk: wat is wel en niet getest?

Deze code is gebouwd en getest in een omgeving zonder toegang tot het npm-register, Azure of een SQL Server. Daarom:

- **Wel gecontroleerd:** type-checks van API en frontend (tegen zelfgeschreven type-stubs), 6 unit-tests op de facturatielogica, een bundel-build en een complete klik-test in een browser tegen een mock-API (uren registreren/wijzigen/verwijderen, factureren over meerdere klanten, terugdraaien, tarief toevoegen, klant en medewerker aanmaken, dashboard, medewerker-weergave, mobiel).
- **Nog niet uitgevoerd:** de SQL-scripts en SQL-queries tegen een echte database, `npm install` met de echte pakketten, de echte Azure-uitrol en de Entra-aanmelding. Verwacht dus mogelijk kleine correcties bij de eerste uitrol. Doorloop de [testchecklist](#8-eerste-test-checklist) en meld fouten met de exacte foutmelding.
- **Logo:** `public/apu-logo.svg` is een tijdelijk logo in de huisstijlkleuren. Vervang het door het originele logo van je website (zelfde bestandsnaam, bij voorkeur SVG).

---

## Stappenplan: integreren in je Azure-omgeving

Je hebt nodig: een Azure-abonnement, rechten om een app-registratie in Microsoft Entra te maken (bijv. rol *Application Administrator* of *Global Administrator*), een GitHub-account, en Power BI Desktop (voor stap 7).

### 1. Code in GitHub zetten

1. Maak op GitHub een nieuwe (bij voorkeur **private**) repository, bijv. `urenregistratie`.
2. Zet de inhoud van deze map in die repository, op de branch `main` (zorg dat de map `.github` mee gaat; die is verborgen).
3. `node_modules`, `dist` en `api/local.settings.json` horen er niet in te staan (het meegeleverde `.gitignore` regelt dat).

### 2. Azure SQL Database aanmaken

1. Azure Portal > **Create a resource** > **SQL Database**.
2. Kies of maak een **resource group** (bijv. `rg-apu-uren`) en kies een regio in Europa (bijv. *West Europe* of *North Europe*). Gebruik dezelfde regio als straks je Static Web App waar mogelijk.
3. Maak een nieuwe **server** aan. Kies als authenticatie **Use both SQL and Microsoft Entra authentication** en stel jezelf in als **Entra admin**. Onthoud de naam van de server (bijv. `apu-sql.database.windows.net`). Als je ook een SQL-beheerder kiest: bewaar dat wachtwoord in je wachtwoordkluis.
4. Kies bij *Compute + storage* de goedkoopste passende optie. Voor een kleine urenregistratie zijn de *serverless* variant (met automatisch pauzeren) of het *Basic*-niveau doorgaans genoeg. Controleer de actuele prijzen op de Azure-prijspagina; die wijzigen regelmatig. Backup-redundantie: lokaal of zone-redundant volstaat meestal.
5. Bij **Networking**: zet *Allow Azure services and resources to access this server* op **Yes**, en (voor het uitvoeren van de scripts) **Add current client IP address** op **Yes**.
   - Waarom: de API van een Static Web App heeft geen vast uitgaand IP-adres. Deze instelling laat verkeer vanuit Azure toe; de database wordt nog steeds beschermd door SQL-inloggegevens (met een lang, uniek wachtwoord voor `app_api`). Wil je dit strakker, dan is "Bring your own Functions" met VNet-integratie nodig; dat valt buiten deze handleiding.
6. Maak de database aan en wacht tot de implementatie klaar is.

**Scripts uitvoeren**

Open de database in de Portal > **Query editor** (log in met je Entra-account of de SQL-beheerder), of gebruik Azure Data Studio / SSMS / VS Code (mssql-extensie). Voer **in deze volgorde** uit, elk als een geheel:

1. `database/01_schema.sql` (tabellen en indexen; kan veilig opnieuw)
2. `database/02_views.sql` (rapportage-views)
3. `database/03_gebruikers.sql`: **vervang eerst** de twee wachtwoorden `VERVANG-MIJ-...` door lange, unieke wachtwoorden en bewaar ze. Dit maakt `app_api` (voor de app) en `powerbi_reader` (alleen SELECT op schema `rapportage`).
4. `database/04_startdata_optioneel.sql`: voegt de functies *Consultant*, *Senior consultant* en *Projectmanager* toe. Sla over als je zelf functies wilt invoeren.

Tip: de Query editor in de Portal verwerkt geen `GO`-scheidingstekens in alle situaties. Voer bij problemen elk blok (tussen twee `GO`-regels) los uit, of gebruik Azure Data Studio/SSMS.

**Connection string voor de app** (bewaar voor stap 4):

```
Server=tcp:<jouw-server>.database.windows.net,1433;Initial Catalog=<jouw-database>;User ID=app_api;Password=<wachtwoord van app_api>;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

### 3. Static Web App aanmaken

1. Portal > **Create a resource** > **Static Web App**.
2. Plan: kies **Standard**. Een eigen (custom) Entra-aanmelding waarbij alleen jouw tenant kan inloggen, vereist het Standard-plan. Zie [Alternatief: Free-plan](#alternatief-free-plan) als je dat niet wilt.
3. Resource group: dezelfde als bij de database. Geef de app een naam (bijv. `apu-urenregistratie`).
4. **Deployment details**: bron *GitHub*, autoriseer GitHub, kies je organisatie, repository en branch `main`.
5. **Build Details**: *Build Presets* = **Custom** en vul in:
   - App location: `/`
   - Api location: `api`
   - Output location: `dist`
6. Maak de Static Web App aan. Azure zet nu een workflow in je repository. Dit project bevat al een eigen workflow (`.github/workflows/azure-static-web-apps.yml`). Houd **één** workflow: verwijder het door Azure gegenereerde bestand (of gebruik het door Azure gegenereerde bestand en verwijder het meegeleverde), zodat de app niet dubbel wordt gebouwd.
7. Voor de meegeleverde workflow: kopieer in de Portal bij de Static Web App > **Overview** > **Manage deployment token** het token en zet het in GitHub bij *Settings > Secrets and variables > Actions* als secret `AZURE_STATIC_WEB_APPS_API_TOKEN`. (Als Azure de workflow zelf aanmaakte, staat dit secret er al onder een eigen naam; pas dan de naam in het workflowbestand aan.)
8. Noteer de standaard-URL van de app (bijv. `https://gentle-river-0abc123.azurestaticapps.net`), je hebt hem in stap 4 nodig.

### 4. Inloggen met je APu-domein (Microsoft Entra)

1. Portal > **Microsoft Entra ID** > **App registrations** > **New registration**.
   - Naam: `APu Urenregistratie`
   - Supported account types: **Accounts in this organizational directory only (single tenant)**
   - Redirect URI: platform **Web**, waarde `https://<jouw-app-url>/.auth/login/aad/callback`
2. Open de registratie > **Authentication**: zet onder *Implicit grant and hybrid flows* **ID tokens** aan. Voeg eventueel ook de redirect URI voor uitloggen toe: `https://<jouw-app-url>/.auth/logout/aad/callback`.
3. Noteer op de *Overview*-pagina de **Application (client) ID** en **Directory (tenant) ID**.
4. **Certificates & secrets** > **New client secret**. Kopieer direct de *Value* (die zie je maar één keer). Noteer de vervaldatum in je agenda: als het secret verloopt, kan niemand meer inloggen.
5. Beperk toegang tot APu-medewerkers: Entra ID > **Enterprise applications** > `APu Urenregistratie` > **Properties** > **Assignment required?** = **Yes**, en wijs onder **Users and groups** jezelf en (later) je medewerkers of een groep toe. Dit is een extra slot. De app zelf controleert bovendien altijd of de ingelogde persoon als medewerker in de database staat.
6. Pas in het project `public/staticwebapp.config.json` aan: vervang `VERVANG-DOOR-JE-TENANT-ID` door je **Directory (tenant) ID**. Commit en push.
7. Portal > je Static Web App > **Settings > Environment variables** (of *Configuration > Application settings*). Voeg toe:

   | Naam | Waarde |
   |---|---|
   | `AZURE_CLIENT_ID` | Application (client) ID |
   | `AZURE_CLIENT_SECRET` | de secret *Value* |
   | `SQL_CONNECTION_STRING` | de connection string uit stap 2 (gebruiker `app_api`) |
   | `ADMIN_EMAILS` | `a.pullens@apuconsultancy.nl` (kommagescheiden voor meerdere beheerders) |

8. Ga naar de GitHub-repository > **Actions** en controleer dat de workflow slaagt (groen). Een push naar `main` start hem opnieuw.

### 5. Eerste keer inloggen en gegevens invullen

1. Open de app-URL en log in met je APu-account. Doordat je e-mailadres in `ADMIN_EMAILS` staat, wordt je automatisch als **beheerder** aangemaakt.
2. Vul de gegevens in deze volgorde in:
   1. **Instellingen** > functies (overslaan als je script 04 hebt gebruikt)
   2. **Klanten** > nieuwe klant > op de detailpagina de **tarieven** per functie met ingangsdatum
   3. **Projecten** > nieuw project bij een klant
   4. **Instellingen** > **Medewerker toevoegen**: e-mailadres exact zoals de persoon inlogt (zie `/.auth/me` in de probleemoplossing), naam, rol (*Medewerker* of *Admin*) en eventueel een standaardfunctie
3. Voor elke medewerker die de app mag gebruiken: wijs ook toe in Entra (stap 4.5). Medewerkers zien alleen **Mijn uren** en nooit tarieven of bedragen.

### 6. Eigen domein (optioneel)

Portal > Static Web App > **Custom domains** > **Add**, bijv. `uren.apuconsultancy.nl`. Maak bij je DNS-provider het gevraagde **CNAME**-record aan naar de standaard-URL van de app en volg de validatie. Voeg daarna in de Entra-app-registratie (**Authentication**) ook de redirect URI `https://uren.apuconsultancy.nl/.auth/login/aad/callback` toe.

### 7. Power BI koppelen

De koppeling loopt rechtstreeks op Azure SQL via de read-only views in schema `rapportage`: `vw_Uren` (feitentabel), `vw_Klant`, `vw_Project`, `vw_Functie`, `vw_Medewerker`, `vw_Facturatie`, `vw_Tarief` en `vw_FacturatiePerProject`. Medewerker-e-mailadressen zitten er bewust niet in.

1. Open **Power BI Desktop** > *Gegevens ophalen* > *Azure SQL Database*. (Of maak de queries uit `powerbi/Urenregistratie.pq`: eerst de parameters `ServerNaam` en `DatabaseNaam`, daarna één query per view.)
2. Kies **Import** (aanbevolen: snel, en de database kan pauzeren) en selecteer de views uit schema `rapportage`.
3. Inloggen: kies **Database** en gebruik `powerbi_reader` met het wachtwoord uit stap 2, of **Microsoft-account** als je het Entra-blok in `03_gebruikers.sql` hebt uitgevoerd.
4. Leg de relaties en maatstaven aan volgens `powerbi/Maatstaven.dax` (sterschema: `Uren` in het midden). Daarin staan o.a. *Uren/Bedrag gefactureerd*, *niet gefactureerd*, *Facturatiegraad %* en *Niet gefactureerd ouder dan 30 dagen*.
5. Bouw een matrix Klant > Project met [Uren/Bedrag gefactureerd] en [Uren/Bedrag niet gefactureerd], en een gestapelde staaf per klant.
6. **Publiceren en vernieuwen:** publiceer naar de Power BI-service (werkruimte naar keuze), ga bij de semantische dataset naar *Settings > Data source credentials* en vul de inloggegevens van `powerbi_reader` in. Stel **Scheduled refresh** in. Voor geplande vernieuwing werkt een SQL-login (`powerbi_reader`) het eenvoudigst; met een Entra-account kan het token verlopen.
7. De Power BI-service draait in Azure en kan de database bereiken zolang *Allow Azure services* aan staat (stap 2.5). Lukt een vernieuwing niet, kijk dan in de database-firewall of gebruik een on-premises data gateway.
8. Als de database is gepauzeerd (serverless), kan de eerste verbindingspoging mislukken terwijl hij opstart. Stel eventueel een tweede vernieuwing in of zet automatisch pauzeren uit als dat vaak gebeurt.
9. Alleen kijken in Power BI, nooit schrijven: `powerbi_reader` heeft geen schrijfrechten en geen toegang tot `dbo`.

### 8. Eerste test-checklist

- [ ] GitHub Actions-run is groen (API-tests slagen, build en uitrol slagen).
- [ ] Open de app-URL: je wordt naar Microsoft doorgestuurd, logt in en komt in de app terecht als beheerder.
- [ ] Klant + tarief + project aanmaken werkt.
- [ ] Uren registreren: het tarief van de klant en functie wordt getoond (alleen voor beheerders).
- [ ] Facturatie: selecteer uren; het overzicht per project en functie toont uren en bedrag; markeren als gefactureerd verplaatst ze naar *Gefactureerd (historie)*; terugdraaien werkt.
- [ ] Dashboard toont per klant en project gefactureerd vs. nog te factureren.
- [ ] Testmedewerker (ander account) ziet alleen *Mijn uren*, geen bedragen.
- [ ] Power BI kan verversen en toont dezelfde totalen als het dashboard.

---

## Alternatief: Free-plan

Met het Free-plan kun je geen eigen Entra-registratie (custom authentication) gebruiken, wel de vooraf ingestelde **aad**-provider. Verwijder dan het hele `auth`-blok uit `public/staticwebapp.config.json` en sla stap 4.1 t/m 4.6 over (de app-instellingen `AZURE_CLIENT_ID` en `AZURE_CLIENT_SECRET` zijn dan niet nodig). Let op: de vooraf ingestelde provider laat elk Microsoft-werk- of schoolaccount inloggen. Toegang wordt dan afgedwongen door de database: alleen e-mailadressen in de tabel *Medewerker* (of `ADMIN_EMAILS`) komen verder, anderen krijgen "geen toegang". De vereiste rollen `authenticated` blijven gelden. Controleer voor productie de actuele beperkingen van het Free-plan (o.a. voor de managed API) in de Microsoft-documentatie.

## Lokaal ontwikkelen

Vereist: Node 20, [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local), de [SWA CLI](https://learn.microsoft.com/azure/static-web-apps/local-development) en toegang tot een (test)database.

```bash
npm install                       # frontend
cd api && npm install && cd ..    # API
cp api/local.settings.json.example api/local.settings.json   # vul SQL_CONNECTION_STRING in
swa start http://localhost:5173 --run "npm run dev" --api-location api
```

- Open `http://localhost:4280`. De SWA CLI simuleert de aanmelding (je vult zelf een e-mailadres in; gebruik een adres uit `ADMIN_EMAILS` of de tabel *Medewerker*).
- Voeg je eigen IP-adres toe aan de database-firewall om lokaal te kunnen verbinden. Gebruik bij voorkeur een aparte testdatabase.
- Werkt het starten van de API niet zonder opslag, vul dan bij `AzureWebJobsStorage` `UseDevelopmentStorage=true` in en start Azurite.
- API-tests: `cd api && npm test`.

## Probleemoplossing

| Symptoom | Oorzaak en oplossing |
|---|---|
| Na inloggen "Je hebt geen toegang tot deze applicatie" | Het e-mailadres staat niet (actief) in *Medewerker*. Kijk op `https://<app-url>/.auth/me` bij `userDetails`: dat adres moet exact overeenkomen (hoofdletters maken niet uit). Voeg toe via Instellingen of `ADMIN_EMAILS`. |
| Oneindige inlog-lus of 401 | Redirect URI in de app-registratie klopt niet, tenant-ID in `staticwebapp.config.json` is nog het voorbeeld, of `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` ontbreken of het secret is verlopen. |
| Melding "database wordt opgestart" (HTTP 503) | Serverless database die wakker wordt. De app probeert het automatisch opnieuw; na maximaal ~30 seconden is het klaar. |
| 500 op alle API-aanroepen | `SQL_CONNECTION_STRING` ontbreekt of is fout, of de firewall staat *Allow Azure services* niet toe. Bekijk de logs: Portal > Static Web App > Functions (of Application Insights, als je die koppelt). |
| Build slaagt maar de API mist | Controleer dat Api location `api` is en dat `platform.apiRuntime` in `staticwebapp.config.json` `node:20` is. |
| Uren zijn vergrendeld | Gefactureerde uren zijn niet te wijzigen. Draai eerst de facturatie terug (Facturatie > Historie). |

## Beheer, back-ups en kosten

- Azure SQL maakt automatisch back-ups (point-in-time restore); controleer de bewaartermijn in de Portal onder de database > *Backups*.
- Zet een herinnering voor de vervaldatum van het client secret (stap 4.4) en wijzig de wachtwoorden van `app_api` en `powerbi_reader` af en toe (`ALTER USER ... WITH PASSWORD = '...'`, en pas daarna de app-instelling of de Power BI-inloggegevens aan).
- Kosten: een Static Web App (Standard), een kleine Azure SQL Database en Power BI-licenties. Controleer altijd de actuele prijzen in de Azure-prijscalculator.

## Techniek in het kort

- **Auth:** Static Web Apps zet de gebruiker (gesigneerd) in de header `x-ms-client-principal`; de API zoekt het e-mailadres op in *Medewerker* en bepaalt de rol (Admin/Medewerker). Alle routes vereisen `authenticated`. Voor medewerkers geeft de API nooit tarieven of bedragen terug.
- **Facturatie:** in één transactie (met vergrendeling) worden de gekozen uren per klant aan een nieuwe *Facturatie* gekoppeld. Het overzicht in de frontend en de bevestiging in de API gebruiken dezelfde rekenlogica.
- **Rapportage:** views in schema `rapportage`; Power BI heeft alleen daar leesrechten.
