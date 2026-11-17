# Indelingsblok `ind` — v0.4 bijgesteld aan de besluiten van 17-11-2026

Status: **voorstel**, 17-11-2026. Gebouwd als pure functies in `codec/indeling.js` (tabellen in `codec/indeling-tabellen.js`), getest in `tests/test-indeling.js`. Gaat nog **niet** in de QR; `mkpEncode`/`mkpDecode`/`mkpAfkappen` zijn ongewijzigd.

Bronnen: *Meterkastpaspoort v0.4 — fysieke indeling in de QR* (15-11-2026, Drive) en *Paspoort-codec en v0.4 — besluiten* (17-11-2026). Wat de apps nu kennen: `yourwkb-core` (`toestellen.js`, `mkp-materiaal.js`, `kabel.js › AUTOMAAT_MATEN`) en de veldapp (`rails.js`, `indeling.js`, `basis.jsx`).

Markering: **[B-eigenaar]** = keuze die de eigenaar moet bevestigen, **[B-vakman]** = keuze voor een inspecteur, **[v0.4?]** = v0.4 is hier onduidelijk of tegenstrijdig.

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
| kamrail (13) | pol, In, lengte | 19 | 2,4 |
| aardlek (3) | br, pol, In, idn, lek, sel | 23 | 2,9 |
| automaat (2), smeltveiligheid (12) | br, pol, In, kar, grp | 26 | 3,25 |
| aardlekautomaat (4), en elke gereserveerde soort | br, pol, In, kar, idn, lek, sel, grp | 33 | 4,1 |

| Veld | Bits | Waarden |
|---|---|---|
| `soort` | 5 | §2 |
| `br` | 3 | breedte in modules 1–8 (opgeslagen als br − 1). Verplicht. |
| `pol` | 3 | 0 niet vastgelegd · 1P · 1P+N · 2P · 3P · 3P+N · 4P · (7 gereserveerd) |
| `In` | 5 | §3 |
| `kar` | 3 | 0 niet vastgelegd · B · C · D · gG · (5–7 gereserveerd) |
| `idn` | 3 | 0 niet vastgelegd · 10 · 30 · 100 · 300 · 500 mA · (6–7 gereserveerd) |
| `lek` | 3 | 0 niet vastgelegd · AC · A · F · B · (5–7 gereserveerd) |
| `sel` | 1 | selectief (S) |
| `grp` | 7 | groepsnummer 1–127; 0 = geen groep / niet vastgelegd |
| `lengte` | 6 | kamrail: aantal modules dat hij verbindt, 1–63; 0 = niet vastgelegd |

**Waarom per soort en niet vast 3 byte zoals v0.4** **[B-eigenaar]**: met alle uitbreidingen (§2–§5) wordt een vast record 33 bits, dus 5 byte als het byte-uitgelijnd blijft. Een railscheiding of lege plek draagt dan 4 byte nullen. Per soort kost de woning uit §6 101 byte en de bedrijfsverdeler 190; met een vast record van 33 bits zou dat 141 en 289 byte zijn (bit-gepakt), of 169 en 349 (5 byte per record). De prijs: een lezer heeft de veldentabel nodig — maar die heeft hij voor de waarden toch al.

### 1.3 Volgorde en plaats

Zoals v0.4 §4.4: toestellen staan van links naar rechts, rail voor rail; de plaats volgt uit de som van de breedtes; een railscheiding begint een nieuwe rail. Een **lege plek** is een toestel van soort `leeg` (max 8 breed; een groter gat = twee records). Een **kamrail neemt geen plaats in**: hij staat vóór de eerste module die hij verbindt en `lengte` zegt hoeveel modules hij overspant. **[B-vakman]** (Of een kamrail per aardlekblok in de QR moet, of dat `kam` in de kop van het paspoort genoeg is: een woning met vier kamrails kost 9 byte extra.)

### 1.4 "Overig" met een eigen naam

Tekst past niet in een bitrecord. Na de toestellen (op een bytegrens) volgt, als `namen` = 1, **per toestel van soort `overig`, op volgorde**: één lengtebyte (0–30) en de naam in UTF-8 (hooguit 30 byte, net als `mat[].fab/typ`). Geen verwijzingsveld in het record: de n-de naam hoort bij de n-de "overig". Kosten: 1 byte + de naam per overig-toestel; zonder namen 0 byte (de schrijver zet `namen` = 0 als er geen enkele naam is). **[B-eigenaar]** v0.4 §4.3 zegt dat de naam "alleen in profiel volledig" staat; dit voorstel laat de keuze aan het profiel: de kern mag de namenlijst weglaten, de soort blijft dan `overig`.

De apps kennen bij "overig" nu vooral: beltrafo, kWh-meter, schakelklok, overspanningsbeveiliging, relais (`OVERIG_NAMEN`). Die hebben op schakelklok na al een eigen soort; schakelklok valt onder `schakeltoestel` **[B-vakman]**. Een eigen naam is dus de uitzondering.

### 1.5 Versie en overslaan

- De eerste 4 bits zijn altijd de blokversie. Een lezer die de versie niet kent, leest verder niets en meldt **overgeslagen** met het versienummer (`{ overgeslagen: true, versie }`), zonder fout. Versie 0 bestaat niet en is een fout.
- **Nieuwe soorten kunnen erbij zonder nieuwe versie**: een gereserveerde soortcode (14, 16–31) draagt de volle veldenset (33 bits). Een lezer van versie 1 leest zo'n toestel dus gewoon, als `{ soort: "gereserveerd", code, … }`, en de plaatsen erachter kloppen. Een nieuwe soort die andere velden nodig heeft, is een nieuwe versie. **[B-eigenaar]**
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

Codes 0–11 en 15 zijn die van v0.4 §4.3, ongewijzigd. Nieuw: **12 smeltveiligheid** (met `kar` = gG; de motor schreef een stop tot nu als `ov`, dus als "overig") en **13 kamrail** (spec v0.3 kent `mat[].s = "kam"` al). 14 en 16–31 gereserveerd. Van 4 naar 5 bits omdat er met smeltveiligheid en kamrail in 4 bits nog één code vrij zou zijn; het beheer van de typelijst (v0.4 §8) wordt dan meteen een versiekwestie. Kosten: 1 bit per toestel.

## 3. Nominale stroom (5 bits)

`– 1 2 3 4 6 8 10 13 16 20 25 32 35 40 50 63 80 100 125 160 200 250` A (codes 0–22, 23–31 gereserveerd).

- Uit v0.4: alles (2, 4, 6, 10, 13, 16, 20, 25, 32, 35, 40, 50, 63, 80, 100).
- Uit de motor (`AUTOMAAT_MATEN` 6–125): 125 erbij.
- Erbij **[B-vakman]**: 1, 3, 8 (kleine automaten voor stuurstroom en bel), 160, 200, 250 (hoofdschakelaar en lastscheider van een bedrijfsverdeler; zonder die waarden is een 3×160 A-aansluiting niet te beschrijven).
- Eraf: niets. 35 blijft (smeltpatroon). Niet opgenomen: 0,5 en 1,6 A.

## 4. Aardlek en polen

- `idn`: 10 mA erbij (badkamer, besluit 7) en 500 mA (de app kent hem, `RCD_MA`).
- `lek`: F erbij (besluit 7). B+ niet: de app kent hem niet.
- `sel`: 1 bit; de veldapp heeft `ag.selectief` sinds 10-11-2026 (500 ms in plaats van 300 ms). v0.4 noemt het niet. Alleen bij aardlek en aardlekautomaat.
- `pol`: 3 bits in plaats van 2. v0.4 kent geen "niet vastgelegd" (een gescande kast weet de polen vaak niet) en geen 2P/4P naast 1P+N/3P+N; de veldapp kent beide (`POLEN_GROEP`, `POLEN_AARDLEK`). **[B-vakman]** of 2P ≠ 1P+N en 4P ≠ 3P+N in het paspoort het onderscheid waard is; de app telt ze op papier nu als hetzelfde getal.

## 5. Groepsnummer (7 bits)

1–127, 0 = geen groep. Besluit 7 vraagt meer dan 31; 63 (6 bits) is krap voor een hoofdverdeler van een school of kantoor, en de motor accepteert plaatnummers tot 99. Kosten t.o.v. v0.4: 2 bits per groep (40 groepen: 10 byte).

**[v0.4?] [B-eigenaar]** v0.4 §4.4 zegt dat `grp` het record "expliciet" aan `grp[]` koppelt, maar `grp[]` heeft geen nummerveld. Dit voorstel leest het als **de plaats in `grp[]`, vanaf 1**. Het nummer op de groepenverklaring (plaatnummer) kan daarvan afwijken en staat dan niet in de QR. Een thuisbatterij heeft twee regels in `grp[]`; het toestel wijst naar de eerste. Te bevestigen.

## 6. Grootte

### 6.1 Het blok zelf

| Geval | Toestellen | Groepen | Rails | Byte | Tekst (base64url) |
|---|---|---|---|---|---|
| v0.4-voorbeeld §4.6: 20 toestellen op 3 rails | 20 + 2 railscheidingen | 13 | 3 | **64** (v0.4: 68) | 86 |
| Woning, 3 rails × 12, 16 groepen, 4 kamrails, 1 eigen naam | 33 | 16 | 3 | **101** (zonder kamrails 92) | 135 |
| Bedrijfsverdeler 3×80 A, 5 rails × 24, 8 aardlekken 4P, 40 groepen, 8 kamrails | 69 | 40 | 5 | **190** (zonder kamrails 171) | 254 |

Samenstelling staat letterlijk in `tests/test-indeling.js` (A, B, C); de groottes zijn daar vastgelegd.

### 6.2 De kern als geheel — haalt hij 500?

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

**Voorstel voor het budget** **[B-eigenaar]**: de bestaande grens van hoofdstuk 6 (105 modules ≈ 779 tekens) als harde grens voor de kern, ±600 als streefwaarde. Daarbinnen past een woning of een bedrijfsverdeler met indeling en **één** ondertekende logregel (673 resp. 770); een tweede ondertekende regel past er bij een woning met indeling al niet meer bij (±823). Besluit 3 (wat een voorganger tekende blijft geldig) en `ind` in de kern botsen dus zodra er een tweede klus op de kast komt. Wordt het te groot, dan valt in de kern eerst de namenlijst van `ind`, dan de kamrails, dan oudere logregels (met behoud van hun handtekening elders), en pas daarna `ind` zelf. Wie strikt 500 wil, moet `ind` uit de kern halen of de handtekening per regel uit de QR.

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
| 2 | Soort 5 bits; smeltveiligheid 12, kamrail 13; schakelklok onder schakeltoestel | vakman |
| 3 | Kamrail als record zonder breedte, met lengte; per aardlekblok in de QR? | vakman |
| 4 | Stromen erbij: 1, 3, 8, 125, 160, 200, 250 A | vakman |
| 5 | Polen 3 bits met 2P en 4P apart | vakman |
| 6 | 500 mA, type F, selectief-bit | vakman |
| 7 | Groepsnummer 7 bits = plaats in `grp[]` | eigenaar |
| 8 | Namenlijst in het blok, optioneel per profiel | eigenaar |
| 9 | Nieuwe soort zonder versie, nieuwe tabelwaarde = nieuwe versie | eigenaar |
| 10 | `st` verplicht bij schrijven; `mpr` 0 = onbekend | eigenaar |
| 11 | Budget: 500 niet haalbaar; voorstel 105 modules hard, ±600 streef | eigenaar |
| 12 | `ind` als JSON-tekstveld of als los fragmentdeel | eigenaar |
