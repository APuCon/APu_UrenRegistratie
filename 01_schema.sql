/* =====================================================================
   APu Urenregistratie - 01_schema.sql
   Tabellen voor klanten, functies, tarieven, projecten, medewerkers,
   uren en facturatie. Veilig om opnieuw uit te voeren (idempotent).
   Uitvoeren op de Azure SQL Database (NIET op master).
   ===================================================================== */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------- Klant ---------- */
IF OBJECT_ID(N'dbo.Klant', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Klant (
        KlantId         INT            IDENTITY(1,1) NOT NULL CONSTRAINT PK_Klant PRIMARY KEY,
        Naam            NVARCHAR(200)  NOT NULL,
        Contactpersoon  NVARCHAR(200)  NULL,
        Email           NVARCHAR(320)  NULL,
        Telefoon        NVARCHAR(50)   NULL,
        Adres           NVARCHAR(200)  NULL,
        Postcode        NVARCHAR(20)   NULL,
        Plaats          NVARCHAR(100)  NULL,
        KvkNummer       NVARCHAR(20)   NULL,
        BtwNummer       NVARCHAR(30)   NULL,
        Notities        NVARCHAR(MAX)  NULL,
        Actief          BIT            NOT NULL CONSTRAINT DF_Klant_Actief DEFAULT (1),
        AangemaaktOp    DATETIME2(0)   NOT NULL CONSTRAINT DF_Klant_AangemaaktOp DEFAULT (SYSUTCDATETIME()),
        GewijzigdOp     DATETIME2(0)   NOT NULL CONSTRAINT DF_Klant_GewijzigdOp DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_Klant_Naam UNIQUE (Naam)
    );
END
GO

/* ---------- Functie (bijv. Consultant, Senior consultant) ---------- */
IF OBJECT_ID(N'dbo.Functie', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Functie (
        FunctieId       INT            IDENTITY(1,1) NOT NULL CONSTRAINT PK_Functie PRIMARY KEY,
        Naam            NVARCHAR(100)  NOT NULL,
        Actief          BIT            NOT NULL CONSTRAINT DF_Functie_Actief DEFAULT (1),
        CONSTRAINT UQ_Functie_Naam UNIQUE (Naam)
    );
END
GO

/* ---------- Medewerker (= gebruiker van de portal) ----------
   Email moet gelijk zijn aan de inlognaam (UPN / e-mailadres) in Microsoft Entra ID.
   Rol: Admin = alles; Medewerker = alleen eigen uren invullen. */
IF OBJECT_ID(N'dbo.Medewerker', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Medewerker (
        MedewerkerId        INT            IDENTITY(1,1) NOT NULL CONSTRAINT PK_Medewerker PRIMARY KEY,
        Email               NVARCHAR(320)  NOT NULL,
        Naam                NVARCHAR(200)  NOT NULL,
        Rol                 NVARCHAR(20)   NOT NULL CONSTRAINT DF_Medewerker_Rol DEFAULT (N'Medewerker'),
        StandaardFunctieId  INT            NULL,
        Actief              BIT            NOT NULL CONSTRAINT DF_Medewerker_Actief DEFAULT (1),
        AangemaaktOp        DATETIME2(0)   NOT NULL CONSTRAINT DF_Medewerker_AangemaaktOp DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_Medewerker_Email UNIQUE (Email),
        CONSTRAINT CK_Medewerker_Rol CHECK (Rol IN (N'Admin', N'Medewerker')),
        CONSTRAINT FK_Medewerker_Functie FOREIGN KEY (StandaardFunctieId) REFERENCES dbo.Functie (FunctieId)
    );
END
GO

/* ---------- Tarief (uurtarief per klant + functie, met historie) ----------
   Het geldende tarief op een datum = rij met de hoogste GeldigVanaf <= datum. */
IF OBJECT_ID(N'dbo.Tarief', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Tarief (
        TariefId        INT            IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tarief PRIMARY KEY,
        KlantId         INT            NOT NULL,
        FunctieId       INT            NOT NULL,
        UurTarief       DECIMAL(9,2)   NOT NULL,
        GeldigVanaf     DATE           NOT NULL,
        AangemaaktOp    DATETIME2(0)   NOT NULL CONSTRAINT DF_Tarief_AangemaaktOp DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Tarief_Positief CHECK (UurTarief >= 0),
        CONSTRAINT UQ_Tarief UNIQUE (KlantId, FunctieId, GeldigVanaf),
        CONSTRAINT FK_Tarief_Klant   FOREIGN KEY (KlantId)   REFERENCES dbo.Klant (KlantId),
        CONSTRAINT FK_Tarief_Functie FOREIGN KEY (FunctieId) REFERENCES dbo.Functie (FunctieId)
    );
END
GO

/* ---------- Project ---------- */
IF OBJECT_ID(N'dbo.Project', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Project (
        ProjectId       INT            IDENTITY(1,1) NOT NULL CONSTRAINT PK_Project PRIMARY KEY,
        KlantId         INT            NOT NULL,
        Code            NVARCHAR(30)   NULL,
        Naam            NVARCHAR(200)  NOT NULL,
        Omschrijving    NVARCHAR(1000) NULL,
        Status          NVARCHAR(20)   NOT NULL CONSTRAINT DF_Project_Status DEFAULT (N'Actief'),
        StartDatum      DATE           NULL,
        EindDatum       DATE           NULL,
        AangemaaktOp    DATETIME2(0)   NOT NULL CONSTRAINT DF_Project_AangemaaktOp DEFAULT (SYSUTCDATETIME()),
        GewijzigdOp     DATETIME2(0)   NOT NULL CONSTRAINT DF_Project_GewijzigdOp DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Project_Status CHECK (Status IN (N'Actief', N'Afgerond', N'Gearchiveerd')),
        CONSTRAINT UQ_Project_KlantNaam UNIQUE (KlantId, Naam),
        CONSTRAINT FK_Project_Klant FOREIGN KEY (KlantId) REFERENCES dbo.Klant (KlantId)
    );
END
GO

/* ---------- Facturatie (een 'facturatiebatch' per klant) ----------
   Ontstaat wanneer uren van 'niet gefactureerd' naar 'gefactureerd' gaan.
   Totalen zijn een momentopname op het moment van factureren. */
IF OBJECT_ID(N'dbo.Facturatie', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Facturatie (
        FacturatieId    INT            IDENTITY(1,1) NOT NULL CONSTRAINT PK_Facturatie PRIMARY KEY,
        KlantId         INT            NOT NULL,
        Referentie      NVARCHAR(100)  NULL,         -- bijv. factuurnummer uit je boekhouding
        FactuurDatum    DATE           NOT NULL,
        Opmerking       NVARCHAR(500)  NULL,
        TotaalUren      DECIMAL(9,2)   NOT NULL,
        TotaalBedrag    DECIMAL(12,2)  NOT NULL,
        AangemaaktDoor  NVARCHAR(320)  NOT NULL,
        AangemaaktOp    DATETIME2(0)   NOT NULL CONSTRAINT DF_Facturatie_AangemaaktOp DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Facturatie_Klant FOREIGN KEY (KlantId) REFERENCES dbo.Klant (KlantId)
    );
END
GO

/* ---------- Uur (geregistreerde uren) ----------
   UurTarief is een momentopname van het tarief bij registratie, zodat een latere
   tariefwijziging oude uren niet ongemerkt verandert.
   FacturatieId IS NULL  = niet gefactureerd.  FacturatieId gevuld = gefactureerd. */
IF OBJECT_ID(N'dbo.Uur', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Uur (
        UurId           BIGINT         IDENTITY(1,1) NOT NULL CONSTRAINT PK_Uur PRIMARY KEY,
        MedewerkerId    INT            NOT NULL,
        ProjectId       INT            NOT NULL,
        FunctieId       INT            NOT NULL,
        TariefId        INT            NOT NULL,
        Datum           DATE           NOT NULL,
        Aantal          DECIMAL(5,2)   NOT NULL,
        UurTarief       DECIMAL(9,2)   NOT NULL,
        Bedrag          AS (CAST(ROUND(Aantal * UurTarief, 2) AS DECIMAL(12,2))) PERSISTED,
        Omschrijving    NVARCHAR(500)  NULL,
        FacturatieId    INT            NULL,
        AangemaaktOp    DATETIME2(0)   NOT NULL CONSTRAINT DF_Uur_AangemaaktOp DEFAULT (SYSUTCDATETIME()),
        GewijzigdOp     DATETIME2(0)   NOT NULL CONSTRAINT DF_Uur_GewijzigdOp DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Uur_Aantal CHECK (Aantal > 0 AND Aantal <= 24),
        CONSTRAINT FK_Uur_Medewerker  FOREIGN KEY (MedewerkerId) REFERENCES dbo.Medewerker (MedewerkerId),
        CONSTRAINT FK_Uur_Project     FOREIGN KEY (ProjectId)    REFERENCES dbo.Project (ProjectId),
        CONSTRAINT FK_Uur_Functie     FOREIGN KEY (FunctieId)    REFERENCES dbo.Functie (FunctieId),
        CONSTRAINT FK_Uur_Tarief      FOREIGN KEY (TariefId)     REFERENCES dbo.Tarief (TariefId),
        CONSTRAINT FK_Uur_Facturatie  FOREIGN KEY (FacturatieId) REFERENCES dbo.Facturatie (FacturatieId)
    );

    CREATE INDEX IX_Uur_Medewerker_Datum  ON dbo.Uur (MedewerkerId, Datum) INCLUDE (Aantal, Bedrag, FacturatieId);
    CREATE INDEX IX_Uur_Project_Datum     ON dbo.Uur (ProjectId, Datum)    INCLUDE (Aantal, Bedrag, FacturatieId);
    CREATE INDEX IX_Uur_Facturatie        ON dbo.Uur (FacturatieId);
    CREATE INDEX IX_Uur_Tarief            ON dbo.Uur (TariefId);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Project_Klant' AND object_id = OBJECT_ID(N'dbo.Project'))
    CREATE INDEX IX_Project_Klant ON dbo.Project (KlantId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Facturatie_Klant' AND object_id = OBJECT_ID(N'dbo.Facturatie'))
    CREATE INDEX IX_Facturatie_Klant ON dbo.Facturatie (KlantId);
GO
