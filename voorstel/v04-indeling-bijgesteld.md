# Indelingsblok `ind` — v0.4 bijgesteld aan de besluiten van 17-11-2026

Status: **voorstel**, 17-11-2026. Gebouwd als pure functies in `codec/indeling.js` (tabellen in `codec/indeling-tabellen.js`), getest in `tests/test-indeling.js`. Gaat nog **niet** in de QR; `mkpEncode`/`mkpDecode`/`mkpAfkappen` zijn ongewijzigd.

Bronnen: *Meterkastpaspoort v0.4 — fysieke indeling in de QR* (15-11-2026, Drive) en *Paspoort-codec en v0.4 — besluiten* (17-11-2026). Wat de apps nu kennen: `yourwkb-core` (`toestellen.js`, `mkp-materiaal.js`, `kabel.js › AUTOMAAT_MATEN`) en de veldapp (`rails.js`, `indeling.js`, `basis.jsx`).

Markering: **[B-eigenaar]** = keuze die de eigenaar nog moet bevestigen, **[B-vakman]** = keuze voor een inspecteur, **[v0.4?]** = v0.4 is hier onduidelijk of tegenstrijdig. Wat de eigenaar op 17-11-2026 heeft besloten staat zonder markering en is verzameld in §8; het blok is nog nergens uitgegeven, dus de versie blijft 1.

---

## 1. Het blok in één oogopslag

Bitstroom, hoogste bit eerst. Kop van 4 byte, dan de toestellen achter elkaar, opgevuld met nulbits tot een hele byte, dan (optioneel) de namenlijst.

### 1.1 Kop — 32 bits

| Veld | Bits | Waarden |
|---|---|---|
| `versie` | 4 | blokversie, nu 1. **Staat in elke versie in de eerste 4 bits.** |
| `st` | 2 | 0 gemeten · 1 ontworpen · 2 gebouwd, niet gemeten · 3 gereserveerd |
| `wr` | 2 | warmteroute: 0 onbekend · 1 beproefd · 2 afgeleid · 3 berekend (v0.4 §4.5) |
| `mpr` | 8 | modules per rail, 1–255; **0 = niet vastgelegd** (nieuw) |
| `aantal` | 10 | aantal toestellen, 0–1023 (nieuw) |
| `namen` | 1 | 1 = er volgt een namenlijst (nieuw) |
| reserve | 5 | moet 0 zijn |

`aantal` is nieuw omdat de records niet meer even lang zijn (§1.2): zonder telling is een afgekapt blok niet te onderscheiden van een kort blok.

### 1.2 Toestel — de soort bepaalt welke velden volgen

Elk toestel begint met `soort` (5 bits). Daarna volgen **alleen de velden die bij die soort horen**, in vaste volgorde. Er zijn geen lengtevelden nodig: de soort zegt hoe lang het record is.

| Soort (code) | Velden na de soort | Bits | Byte |
|---|---|---|---|
| railscheiding (15) | — | 5 | 0,6 |
| leeg (0) | br | 8 | 1 |
| beltrafo (6), schakeltoestel (7), kwh-meter (8), overspanning (5), overig (11) | br, pol | 11 | 1,4 |
| hoofdschakelaar (1), pv-scheider (9), lastscheider (10) | br, pol, In | 16 | 2 |
| aardlek (3) | br, pol, In, idn, lek, sel | 23 | 2,9 |
| automaat (2), smeltveiligheid (12) | br, pol, In, kar, grp | 26 | 3,25 |
| aardlekautomaat (4), en elke gereserveerde soort | br, pol, In, kar, idn, lek, sel, grp | 33 | 4,1 |

| Veld | Bits | Waarden |
|---|---|---|
| `soort` | 5 | §2 |
| `br` | 3 | breedte in modules 1–8 (opgeslagen als br − 1). Verplicht. |
| `pol` | 3 | 0 niet vastgelegd · 1P · 1P+N · 3P · 3P+N · (5–7 gereserveerd). Inpakken neemt ook "2P" (= 1P+N) en "4P" (= 3P+N) aan; uitpakken geeft altijd de vorm met +N. |
| `In` | 5 | §3 |
| `kar` | 3 | 0 niet vastgelegd · B · C · D · gG · (5–7 gereserveerd) |
| `idn` | 3 | 0 niet vastgelegd · 10 · 30 · 100 · 300 · 500 mA · (6–7 gereserveerd) |
| `lek` | 3 | 0 niet vastgelegd · AC · A · F · B · (5–7 gereserveerd) |
| `sel` | 1 | selectief (S) |
| `grp` | 7 | groepsnummer 1–127; 0 = geen groep / niet vastgelegd |

**Waarom per soort en niet vast 3 byte zoals v0.4** **[B-eigenaar]**: met alle uitbreidingen (§2–§5) wordt een vast record 33 bits, dus 5 byte als het byte-uitgelijnd blijft. Een railscheiding of lege plek draagt dan 4 byte nullen. Per soort kost de woning uit §6 92 byte en de bedrijfsverdeler 171; met een vast record van 33 bits zou dat 124 en 256 byte zijn (bit-gepakt, zonder namenlijst), of 149 en 309 (5 byte per record). De prijs: een lezer heeft de veldentabel nodig — maar die heeft hij voor de waarden toch al.

### 1.3 Volgorde en plaats

Zoals v0.4 §4.4: toestellen staan van links naar rechts, rail voor rail; de plaats volgt uit de som van de breedtes; een railscheiding begint een nieuwe rail. Een **lege plek** is een toestel van soort `leeg` (max 8 breed; een groter gat = twee records). **De kamrail staat niet in de indeling.** Hij wordt één keer per kast vastgelegd in het paspoortveld `kam` (buiten dit blok) en is overal in de kast hetzelfde; besloten op 17-11-2026. Soortcode 13 (in een eerder concept `kamrail`) blijft **gereserveerd en wordt niet hergebruikt**, zodat codes stabiel blijven. Inpakken weigert een toestel van soort `kamrail` met een fout die naar het veld per kast verwijst. Uitpakken volgt de regel van §1.5 voor een gereserveerde soort: code 13 wordt gelezen als `{ soort: "gereserveerd", code: 13, … }` met de volle veldenset (33 bits), en de plaatsen erachter kloppen.

### 1.4 "Overig" met een eigen naam

Tekst past niet in een bitrecord. Na de toestellen (op een bytegrens) volgt, als `namen` = 1, **per toestel van soort `overig`, op volgorde**: één lengtebyte (0–30) en de naam in UTF-8 (hooguit 30 byte, net als `mat[].fab/typ`). Geen verwijzingsveld in het record: de n-de naam hoort bij de n-de "overig". Kosten: 1 byte + de naam per overig-toestel; zonder namen 0 byte (de schrijver zet `namen` = 0 als er geen enkele naam is). **[B-eigenaar]** v0.4 §4.3 zegt dat de naam "alleen in profiel volledig" staat; dit voorstel laat de keuze aan het profiel: de kern mag de namenlijst weglaten, de soort blijft dan `overig`.

De apps kennen bij "overig" nu vooral: beltrafo, kWh-meter, schakelklok, overspanningsbeveiliging, relais (`OVERIG_NAMEN`). Die hebben op schakelklok na al een eigen soort; schakelklok valt onder `schakeltoestel`. Een eigen naam is dus de uitzondering.

### 1.5 Versie en overslaan

- De eerste 4 bits zijn altijd de blokversie. Een lezer die de versie niet kent, leest verder niets en meldt **overgeslagen** met het versienummer (`{ overgeslagen: true, versie }`), zonder fout. Versie 0 bestaat niet en is een fout.
- **Nieuwe soorten kunnen erbij zonder nieuwe versie**: een gereserveerde soortcode (13, 14, 16–31) draagt de volle veldenset (33 bits). Een lezer van versie 1 leest zo'n toestel dus gewoon, als `{ soort: "gereserveerd", code, … }`, en de plaatsen erachter kloppen. Een nieuwe soort die andere velden nodig heeft, is een nieuwe versie. **[B-eigenaar]**
- **Nieuwe waarden in een tabel** (een stroom, een karakteristiek) zijn een nieuwe blokversie; een lezer van versie 1 weigert een gereserveerde waardecode. Reden: een onbekende waarde half tonen is erger dan het blok overslaan.
- Het blok reist als losse tekst (§6), dus de lengte ervan is altijd bekend; een lengteveld in de kop is daarom niet nodig.

### 1.6 Bewust niet opgenomen

| Niet in `ind` | Waarom |
|---|---|
| fase per toestel | staat in `grp[].fn`; via `grp` gekoppeld |
| welke groep achter welke aardlek | staat in `grp[].al`; de fysieke volgorde zegt het niet altijd |
| merk, type, artikelnummer | `mat[]`, en artikelnummers alleen in *volledig* (v0.4 §3) |
| plaatsnummer, positieveld | volgt uit de volgorde |
| kabel (doorsnede, lengte, aanlegwijze) | volledig dossier |
| kortsluitvermogen (Icu, kA) van een toestel | geen app legt het vast |
| karakteristiek K/Z/aM, aardlek B+ / RDC-DD, 6 mA | geen app kent ze; codes zijn gereserveerd |
| herkomst/zekerheid (foto, paspoort, met de hand) | eigenschap van het werkproces, niet van de kast; `st` dekt het verschil gemeten/niet gemeten |
| verwijzing naar een onderverdeler | gaat mee in de kern via `vd`/`voed` en `grp[].vd`; `ind` koppelt via `grp` aan de voedende groep |

## 2. De soorten (5 bits)

Codes 0–11 en 15 zijn die van v0.4 §4.3, ongewijzigd. Nieuw: **12 smeltveiligheid** (met `kar` = gG; de motor schreef een stop tot nu als `ov`, dus als "overig"). **13 is gereserveerd** (was kamrail, zie §1.3), net als 14 en 16–31. Van 4 naar 5 bits omdat er met smeltveiligheid in 4 bits nog maar enkele codes vrij zouden zijn; het beheer van de typelijst (v0.4 §8) wordt dan meteen een versiekwestie. Kosten: 1 bit per toestel.

## 3. Nominale stroom (5 bits)

`– 1 2 3 4 6 8 10 13 16 20 25 32 35 40 50 63 80 100 125 160 200 250` A (codes 0–22, 23–31 gereserveerd).

- Uit v0.4: alles (2, 4, 6, 10, 13, 16, 20, 25, 32, 35, 40, 50, 63, 80, 100).
- Uit de motor (`AUTOMAAT_MATEN` 6–125): 125 erbij.
- Erbij (besloten 17-11-2026): 1, 3, 8 (kleine automaten voor stuurstroom en bel), 160, 200, 250 (hoofdschakelaar en lastscheider van een bedrijfsverdeler; zonder die waarden is een 3×160 A-aansluiting niet te beschrijven).
- Eraf: niets. 35 blijft (smeltpatroon). Niet opgenomen: 0,5 en 1,6 A.

## 4. Aardlek en polen

- `idn`: 10 mA erbij (badkamer, besluit 7) en 500 mA (de app kent hem, `RCD_MA`); besloten 17-11-2026.
- `lek`: F erbij (besluit 7); besloten 17-11-2026. B+ niet: de app kent hem niet.
- `sel`: 1 bit, besloten 17-11-2026; de veldapp heeft `ag.selectief` sinds 10-11-2026 (500 ms in plaats van 300 ms). v0.4 noemt het niet. Alleen bij aardlek en aardlekautomaat.
- `pol`: de lijst is 1P, 1P+N, 3P, 3P+N, plus 0 = niet vastgelegd (v0.4 kent dat niet; een gescande kast weet de polen vaak niet). **2P en 4P zijn geen aparte waarden** (besloten 17-11-2026): 2P geldt als 1P+N en 4P als 3P+N. De veldapp schrijft bij aardlekschakelaars "2P" en "4P" (`POLEN_AARDLEK`); inpakken accepteert die schrijfwijzen en zet ze om (`INDELING_POLEN_ALIAS`). **Uitpakken geeft altijd de vorm met +N terug**, dus inpakken en weer uitpakken van "4P" levert "3P+N". Het veld blijft 3 bits (vijf waarden plus "niet vastgelegd" passen niet in 2); de codes 5, 6 en 7 zijn gereserveerd en een lezer weigert ze. De drie voorbeelden zijn daarom even groot als met aparte 2P/4P-waarden.

## 5. Groepsnummer (7 bits)

1–127, 0 = geen groep. Besluit 7 vraagt meer dan 31; 63 (6 bits) is krap voor een hoofdverdeler van een school of kantoor, en de motor accepteert plaatnummers tot 99. Kosten t.o.v. v0.4: 2 bits per groep (40 groepen: 10 byte).

**[v0.4?] [B-eigenaar]** v0.4 §4.4 zegt dat `grp` het record "expliciet" aan `grp[]` koppelt, maar `grp[]` heeft geen nummerveld. Dit voorstel leest het als **de plaats in `grp[]`, vanaf 1**. Het nummer op de groepenverklaring (plaatnummer) kan daarvan afwijken en staat dan niet in de QR. Een thuisbatterij heeft twee regels in `grp[]`; het toestel wijst naar de eerste. Te bevestigen.

## 6. Grootte

### 6.1 Het blok zelf

| Geval | Toestellen | Groepen | Rails | Byte | Tekst (base64url) |
|---|---|---|---|---|---|
| v0.4-voorbeeld §4.6: 20 toestellen op 3 rails | 20 + 2 railscheidingen | 13 | 3 | **64** (v0.4: 68; ongewijzigd) | 86 (ongewijzigd) |
| Woning, 3 rails × 12, 16 groepen, 1 eigen naam | 29 | 16 | 3 | **92** (was 101 met 4 kamrails) | **123** (was 135) |
| Bedrijfsverdeler 3×80 A, 5 rails × 24, 8 aardlekken, 40 groepen | 61 | 40 | 5 | **171** (was 190 met 8 kamrails) | **228** (was 254) |

De kamrails zijn uit de voorbeelden gehaald (ze staan niet meer in de indeling, §1.3): de woning scheelt 9 byte en 12 tekens, de bedrijfsverdeler 19 byte en 26 tekens; de bedrijfsverdeler heeft zijn aardlekken nu als 3P+N (was "4P", een andere code maar even breed, dus niet van invloed op de grootte). Samenstelling staat letterlijk in `tests/test-indeling.js` (A, B, C); de groottes zijn daar vastgelegd.

### 6.2 De kern als geheel — haalt hij 500? (gemeten 17-11-2026, met de blokken van vóór het schrappen van de kamrails)

Gemeten met de bestaande codec: volledige URL `https://meterkastpaspoort.nl/p#…` in tekens (= bytes in de QR), QR op niveau M. "Vast" = `v d pc nr ean bj ha kam vd` + datum volgende inspectie (besluit 5); `grp[]` zonder namen; logregel met bedrijf, werk en `erk`; `ind` als tekstveld in de JSON. Geen `mat[]`.

| Kern | URL-tekens | QR-modules |
|---|---|---|
| woning, zonder `ind`, logregel zonder handtekening | 398 | 77 |
| woning + `ind` | 563 | 93 |
| woning + `ind`, 1 ondertekende logregel | 673 | 101 |
| woning + `ind`, 3 ondertekende logregels | 974 | 117 |
| bedrijf (40 groepen), zonder `ind` | 405 | 77 |
| bedrijf + `ind` | 659 | 97 |
| bedrijf + `ind`, 1 ondertekende logregel | 770 | 105 |
| bedrijf + `ind`, 3 ondertekende logregels | 1067 | 125 |

**Eerlijk antwoord: nee.** Met `ind` haalt zelfs een woning zonder handtekening de 500 niet (563). Twee oorzaken die niet in de indeling zitten:

1. **Handtekening per logregel (besluit 3)**: elke handtekening is 64 byte die niet comprimeert; een ondertekende logregel kost ±150 URL-tekens, waarvan ±110 de handtekening. v0.4 rekende zijn 500 juist met één handtekening over het geheel (§7.1).
2. **`ind` in de gecomprimeerde JSON**: base64url-tekst comprimeert nauwelijks en wordt daarna nog eens base64url-gecodeerd. Een blok van 101 byte kost zo 163 URL-tekens. Als los fragmentdeel na een scheidingsteken kost het 136 bij de woning; bij de bedrijfsverdeler scheelt het niets (255 tegen 251), omdat de herhaling daar wel comprimeert. Een v0.3-lezer breekt bovendien op zo'n fragment. **[B-eigenaar]**

Ter vergelijking: het ondertekende demopaspoort van de standaard (Jansen) is vandaag al 711 tekens (101 modules).

**Budget:** besloten, zie §9. Gemeten met de oude blokken (met kamrails; de nieuwe blokken zijn 12 resp. 26 tekens korter als losse tekst, de kern niet opnieuw doorgemeten): daarbinnen past een woning of een bedrijfsverdeler met indeling en **één** ondertekende logregel (673 resp. 770); een tweede ondertekende regel past er bij een woning met indeling al niet meer bij (±823). Besluit 3 (wat een voorganger tekende blijft geldig) en `ind` in de kern botsen dus zodra er een tweede klus op de kast komt. Wat er bij een volle sticker als eerste wijkt is besloten in §9.

## 7. Waar v0.4 onduidelijk of tegenstrijdig is

1. **§4.6**: "20 posities op 3 rails" — toestellen of modules? De formule rekent met toestellen plus 2 railscheidingen; een lege plek telt ook als toestel. **[v0.4?]**
2. **§4.4**: `grp` koppelt "expliciet" aan `grp[]`, maar `grp[]` heeft geen nummer (zie §5). **[v0.4?]**
3. **§4.2**: `pol`, `kar`, `idn`, `lek` hebben "n.v.t." maar geen "niet vastgelegd"; voor `pol` ontbreekt zelfs dat. Dit voorstel gebruikt 0 voor beide. **[v0.4?]**
4. **§4.2 vs §4.3**: "vaste 3 byte, byte-uitgelijnd" naast een railscheiding die als volle component 3 byte kost.
5. **§4.3**: "overig — naam staat alleen in profiel volledig", maar hoe een naam in het dossier aan een toestel in de QR hangt, staat er niet.
6. **§5**: `st` = 0 is "gemeten". Een blok vol nullen leest dus als gemeten — de veiligste waarde zou de onschuldige moeten zijn. De codec eist daarom `st` expliciet bij het inpakken. **[B-eigenaar]** of de codes om moeten.
7. **§3** noemt twee profielen (besluit 4: drie) en zet `mat[]` én `ind[]` in de kern; `mat[].pos` wordt met `ind` overbodig, en `mat[]` zelf is groot. De meting in §6.2 laat `mat[]` weg.
8. **§7.1** (één handtekening) is door besluit 3 vervallen; de byterekening van §7.4 klopt daarmee niet meer.
9. **§8** "Base45 of binair" is door besluit 6 beslist: tekst, hier base64url.

## 8. Te bevestigen — samengevat

| | Keuze | Wie |
|---|---|---|
| 1 | Record per soort in plaats van vast 3 byte | eigenaar |
| 2 | Soort 5 bits; smeltveiligheid 12 | vakman |
| 7 | Groepsnummer 7 bits = plaats in `grp[]` | eigenaar |
| 8 | Namenlijst in het blok, optioneel per profiel | eigenaar |
| 9 | Nieuwe soort zonder versie, nieuwe tabelwaarde = nieuwe versie | eigenaar |
| 10 | `st` verplicht bij schrijven; `mpr` 0 = onbekend | eigenaar |
| 12 | `ind` als JSON-tekstveld of als los fragmentdeel | eigenaar |

De nummers hierboven zijn die van het eerdere overzicht (3–6 en 11 zijn besloten, zie hieronder).

**Besloten op 17-11-2026** (door de eigenaar; staat zonder markering in de tekst hierboven):

| | Besluit | Waar verwerkt |
|---|---|---|
| 3 | Geen kamrail per aardlekblok; één keer per kast in het paspoortveld `kam`. Soortcode 13 gereserveerd, inpakken weigert, uitpakken leest hem als gereserveerde soort | §1.2, §1.3, §2, code, tests |
| 5 | Polen: 1P, 1P+N, 3P, 3P+N; 2P en 4P zijn schrijfwijzen van 1P+N en 3P+N; veld blijft 3 bits | §1.2, §4, code, tests |
| 2 | Schakelklok valt onder schakeltoestel | §1.4 |
| 4 | Stromen erbij: 1, 3, 8, 160, 200, 250 A (125 uit de motor) | §3 |
| 6 | 10 mA, 500 mA, type F en het selectief-bit blijven | §4 |
| 11 | Budget: 500 byte vervalt als hard getal | §9 |
| — | Bij een volle sticker gaan oude handtekeningen eerst weg | §9 |

## 9. Budget en wat wijkt op een volle sticker (besloten 17-11-2026, nog geen code)

- **Het budget van 500 byte vervalt als hard getal.** De harde grens blijft de bestaande grens van 105 QR-modules (ongeveer 780 tekens, `QR_MODULES_GRENS`). **600 tekens is de streefwaarde.**
- **Als de sticker vol is, gaan oude handtekeningen als eerste weg:** de sticker houdt de indeling en de handtekening van de **laatste klus**. Eerdere logregels blijven staan, zonder handtekening. Daarmee vervalt het voorstel uit de eerste versie van §6.2 (eerst de namenlijst, dan kamrails, dan oudere logregels met behoud van handtekening); de indeling zelf blijft het langst.
- **Gebouwd (17-11-2026):** `mkpAfkappen` haalt als eerste stap de handtekening (`sig` en `sid`) weg van oudere logregels, van onderen af en alleen zoveel als nodig; de nieuwste regel houdt de zijne, geen regel wordt inhoudelijk gewijzigd. Daarna de bestaande volgorde van hoofdstuk 6. Een regel zonder handtekening leest als "niet ondertekend", nooit als "komt niet overeen" (een handtekening dekt alleen zijn eigen regel). Spec hoofdstuk 6 heeft de stap erbij, als voorstel v0.4.
- **Gebouwd (17-11-2026):** `codec/profielen.js` — `MKP_PROFIELEN` (kern · inspectie · volledig), `MKP_PROFIEL_VELDEN` (wat elk profiel boven het vorige toevoegt; kern = v0.3 + `vd`/`voed` + `frq`, inspectie = `idc`/`con`/`stp`/`log[].mm`, volledig = `res`), `mkpProfiel(p, profiel)` (kopie met alleen dat profiel; onbekende velden blijven; een ondertekende logregel wordt nooit ingekort) en `mkpGrootte(p)` (tekens, modules, streefwaarde 600, grens 105 modules). Het profiel gaat nog niet in de payload (besluit 2). **[B-eigenaar]** de naam en vorm van `frq` ("JJJJ-MM", de volgende inspectie in maanden, zoals de featurespec van de inspecteur voorstelt).
