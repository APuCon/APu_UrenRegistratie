// =====================================================================
// APu Urenregistratie - Power Query (M) voor Power BI Desktop
//
// Gebruik:
//   1. Power BI Desktop > Gegevens ophalen > Lege query > Geavanceerde editor
//      (of: Nieuwe bron > Lege query).
//   2. Maak EERST de twee parameters (blok 0a en 0b) aan via
//      Start > Parameters beheren > Nieuwe parameter (type: Tekst),
//      of plak ze als lege query's in de Geavanceerde editor.
//   3. Maak daarna per blok hieronder een nieuwe lege query, plak de code
//      (alleen het gedeelte tussen de regels ---- ) en geef de query de naam
//      die boven het blok staat.
//   4. Kies bij de eerste keer verbinden: Database-referenties
//      (gebruiker powerbi_reader) of Microsoft-account (Entra), zie README.
//
// Alle views staan in schema [rapportage]. Power BI leest nooit uit dbo.
// =====================================================================


// ---------------------------------------------------------------------
// 0a. Parameter  ->  naam: ServerNaam   (type: Tekst)
//     Waarde: de naam van je Azure SQL-server, bijv. apu-sql.database.windows.net
// ---------------------------------------------------------------------
"apu-sql.database.windows.net" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]


// ---------------------------------------------------------------------
// 0b. Parameter  ->  naam: DatabaseNaam   (type: Tekst)
// ---------------------------------------------------------------------
"urenregistratie" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]


// ---------------------------------------------------------------------
// 1. Query-naam: Uren            (feitentabel, 1 rij per geregistreerd uur)
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Uren"]}[Data],
    Types = Table.TransformColumnTypes(
        Weergave,
        {
            {"Datum", type date},
            {"Uren", type number},
            {"UurTarief", Currency.Type},
            {"Bedrag", Currency.Type},
            {"UrenGefactureerd", type number},
            {"UrenNietGefactureerd", type number},
            {"BedragGefactureerd", Currency.Type},
            {"BedragNietGefactureerd", Currency.Type},
            {"FactuurDatum", type date},
            {"IsGefactureerd", type logical}
        }
    )
in
    Types


// ---------------------------------------------------------------------
// 2. Query-naam: Klant
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Klant"]}[Data]
in
    Weergave


// ---------------------------------------------------------------------
// 3. Query-naam: Project
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Project"]}[Data],
    Types = Table.TransformColumnTypes(Weergave, {{"StartDatum", type date}, {"EindDatum", type date}})
in
    Types


// ---------------------------------------------------------------------
// 4. Query-naam: Functie
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Functie"]}[Data]
in
    Weergave


// ---------------------------------------------------------------------
// 5. Query-naam: Medewerker
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Medewerker"]}[Data]
in
    Weergave


// ---------------------------------------------------------------------
// 6. Query-naam: Facturatie      (1 rij per factuurbatch / facturatie)
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Facturatie"]}[Data],
    Types = Table.TransformColumnTypes(
        Weergave,
        {{"FactuurDatum", type date}, {"TotaalUren", type number}, {"TotaalBedrag", Currency.Type}}
    )
in
    Types


// ---------------------------------------------------------------------
// 7. Query-naam: Tarief          (tarieven per klant + functie, met historie)
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_Tarief"]}[Data],
    Types = Table.TransformColumnTypes(
        Weergave,
        {{"UurTarief", Currency.Type}, {"GeldigVanaf", type date}, {"GeldigTot", type date}}
    )
in
    Types


// ---------------------------------------------------------------------
// 8. Query-naam: FacturatiePerProject   (optioneel; kant-en-klare samenvatting)
//    Handig voor snelle tabellen. De meeste visuals kun je ook direct op
//    'Uren' bouwen met de measures uit Maatstaven.dax.
// ---------------------------------------------------------------------
let
    Bron = Sql.Database(ServerNaam, DatabaseNaam),
    Weergave = Bron{[Schema = "rapportage", Item = "vw_FacturatiePerProject"]}[Data]
in
    Weergave
