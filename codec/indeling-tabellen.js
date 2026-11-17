// De tabellen van het indelingsblok (voorstel v0.4, bijgesteld): welke code welk soort toestel, welke stroom, karakteristiek of aardlekwaarde is, en hoeveel bits elk veld kost.
// Eén bron voor schrijver, lezer en apps: wie een waarde wil tonen of kiezen, leest hem hier.
// Uitleg en motivering: voorstel/v04-indeling-bijgesteld.md.

const vries = (x) => Object.freeze(x);

// Versie van het blok zelf. Staat altijd in de eerste 4 bits, in elke versie.
export const INDELING_VERSIE = 1;

// Breedte van elk veld in bits.
export const INDELING_BITS = vries({
  versie: 4, st: 2, wr: 2, mpr: 8, aantal: 10, namen: 1, reserve: 5,   // kop: 32 bits
  soort: 5, breedte: 3, polen: 3, In: 5, kar: 3, idn: 3, lek: 3, selectief: 1, groep: 7,
});

// Soort toestel, op code. null = gereserveerd. Codes 0–11 en 15 zijn die van v0.4 §4.3.
export const INDELING_SOORTEN = vries([
  "leeg",            // 0  lege ruimte op de rail
  "hoofdschakelaar", // 1
  "automaat",        // 2  installatieautomaat
  "aardlek",         // 3  aardlekschakelaar
  "aardlekautomaat", // 4
  "overspanning",    // 5  overspanningsbeveiliging
  "beltrafo",        // 6  beltransformator
  "schakeltoestel",  // 7  schakelaar, relais, schemerschakelaar, schakelklok
  "kwh-meter",       // 8  kWh-meter of meetmodule
  "pv-scheider",     // 9  scheidingsschakelaar PV/DC
  "lastscheider",    // 10
  "overig",          // 11 met een eigen naam in de namenlijst
  "smeltveiligheid", // 12 nieuw t.o.v. v0.4
  null,              // 13 gereserveerd: was kamrail. De kamrail staat één keer per kast in het paspoort (veld kam), niet in de indeling. Code niet hergebruiken.
  null,              // 14 gereserveerd
  "railscheiding",   // 15 het volgende toestel begint op een nieuwe rail
  ...Array(16).fill(null), // 16–31 gereserveerd
]);

// Welke velden een soort draagt, in deze volgorde na de soortcode. Een gereserveerde
// soort draagt VOL: zo kan een lezer van deze versie een soort die later wordt
// toegekend toch lezen en overslaan.
const VOL = vries(["breedte", "polen", "In", "kar", "idn", "lek", "selectief", "groep"]);
const SCHAKELAAR = vries(["breedte", "polen", "In"]);
const BEVEILIGING = vries(["breedte", "polen", "In", "kar", "groep"]);
const RANDAPPARAAT = vries(["breedte", "polen"]);
export const INDELING_VELDEN = vries({
  leeg: vries(["breedte"]),
  hoofdschakelaar: SCHAKELAAR,
  automaat: BEVEILIGING,
  aardlek: vries(["breedte", "polen", "In", "idn", "lek", "selectief"]),
  aardlekautomaat: VOL,
  overspanning: RANDAPPARAAT,
  beltrafo: RANDAPPARAAT,
  schakeltoestel: RANDAPPARAAT,
  "kwh-meter": RANDAPPARAAT,
  "pv-scheider": SCHAKELAAR,
  lastscheider: SCHAKELAAR,
  overig: RANDAPPARAAT,
  smeltveiligheid: BEVEILIGING,
  railscheiding: vries([]),
  gereserveerd: VOL,
});

// Polen, op code. 0 = niet vastgelegd; codes 5–7 gereserveerd (waar 2P en 4P zouden staan:
// besluit 17-11-2026, 2P geldt als 1P+N en 4P als 3P+N). Inpakken neemt "2P" en "4P" aan
// (INDELING_POLEN_ALIAS); uitpakken geeft altijd de vorm met +N terug.
export const INDELING_POLEN = vries([null, "1P", "1P+N", "3P", "3P+N", null, null, null]);
export const INDELING_POLEN_ALIAS = vries({ "2P": "1P+N", "4P": "3P+N" });

// Nominale stroom in A, op code. 0 = niet vastgelegd; codes 23–31 gereserveerd.
// v0.4 §4.2 ∪ yourwkb-core AUTOMAAT_MATEN ∪ {1, 3, 8, 160, 200, 250}.
export const INDELING_STROMEN = vries([
  null, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 32, 35, 40, 50, 63, 80, 100, 125, 160, 200, 250,
  ...Array(9).fill(null),
]);

// Karakteristiek, op code. 0 = niet vastgelegd of niet van toepassing.
export const INDELING_KARAKTERISTIEKEN = vries([null, "B", "C", "D", "gG", null, null, null]);

// Aanspreekstroom IΔn in mA, op code. 0 = niet vastgelegd.
export const INDELING_AANSPREEKSTROMEN = vries([null, 10, 30, 100, 300, 500, null, null]);

// Aardlektype, op code. 0 = niet vastgelegd.
export const INDELING_AARDLEKTYPEN = vries([null, "AC", "A", "F", "B", null, null, null]);

// Status van de indeling (v0.4 §5). Alleen "gemeten" hoort op een sticker.
export const INDELING_STATUS = vries(["gemeten", "ontworpen", "gebouwd", null]);

// Warmteroute volgens NEN-EN-IEC 61439-1 (v0.4 §4.5): codes, geen normtekst.
export const INDELING_WARMTEROUTE = vries(["onbekend", "beproefd", "afgeleid", "berekend"]);

// Groepsnummer 0 = geen groep of niet vastgelegd; hoogste nummer:
export const INDELING_GROEP_MAX = 2 ** 7 - 1;          // 127
// Breedte in modules: 1 t/m 8 (opgeslagen als breedte − 1).
export const INDELING_BREEDTE_MAX = 2 ** 3;           // 8
// Toestellen per blok, en modules per rail (0 = niet vastgelegd).
export const INDELING_AANTAL_MAX = 2 ** 10 - 1;       // 1023
export const INDELING_MPR_MAX = 2 ** 8 - 1;           // 255
// Een eigen naam bij "overig": hooguit zoveel bytes UTF-8.
export const INDELING_NAAM_MAX = 30;
