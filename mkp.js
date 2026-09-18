// ─────────────────────────────────────────────────────────────────────────────
// Open Meterkastpaspoort — referentie-implementatie van het formaat
//
// Hoort bij de specificatie in index.html. Dit is de code die het formaat
// SCHRIJFT EN LEEST: coderen, decoderen, de URL, de EAN-controle, de
// samenvatting en de leesbaarheidsgrens van de QR.
//
// Een paspoort is een JSON-object conform de specificatie, gecomprimeerd met
// deflate-raw en gecodeerd als base64url in het URL-FRAGMENT achter /p#.
// Fragmenten gaan nooit naar een server: privacy door architectuur. De QR draagt
// zijn gegevens dus zelf mee en werkt in een kelder zonder bereik.
//
// WAT HIER NIET IN HOORT is de vertaling van de gegevens van één applicatie naar
// dit formaat. YourWkb gaat uit van aardlekgroepen met eindgroepen, Kastscan van
// modules op een DIN-rail; die vertaling blijft dus in de app. De standaard is
// het formaat, niet de weg ernaartoe.
//
// Gebruik in een app:
//   package.json: "meterkastpaspoort": "https://github.com/mschut64/meterkastpaspoort/archive/refs/tags/vX.Y.Z.tar.gz"
//   (een tag, geen branch: een push hier verandert de apps niet stilzwijgend)
//   import { mkpEncode, mkpDecode, eanValide } from "meterkastpaspoort";
//
// Licentie CC BY 4.0, net als de specificatie.
// ─────────────────────────────────────────────────────────────────────────────

export const MKP_BASIS = "https://meterkastpaspoort.nl/p#";

// v2 is de DATAMODELVERSIE — het veld `v` in een paspoort — en staat los van de
// documentversie van de specificatie (nu 0.3, zie hoofdstuk 11.1). `v` gaat
// alleen omhoog bij een wijziging die oudere lezers zou breken; documentversie
// 0.3 voegde `log[].zeg` toe zonder dat `v` veranderde. Belangrijkste
// wijziging van v2: `grp[].fn` — de LIJST fasenummers waarop een groep is
// aangesloten ([1], [2], [3] of [1,2,3]). In v0.1 kon `f` óók een fasenummer
// bevatten, wat tot verwarring leidde; sinds v0.2 is `f` alleen nog het AANTAL
// fasen en staat het nummer in `fn`.
//
// Let op voor implementatiebouwers: er bestaan apps die hier `fase: "L2"`
// schrijven. Dat veld staat niet in deze specificatie en lezer.html kent het
// niet. Schrijf `fn`.
//
// Deze module interpreteert `mat[]`, `grp[].mat`, `erk`, `zeg`, `sid` en `sig`
// niet zelf, maar geeft ze bij hergebruik ongeschonden door (mkpSamenvoegen).
// Een handtekening van een ander wordt nooit herberekend of verwijderd.
//
// Ouder leesmateriaal blijft werken: mkpDecode kijkt alleen of `v` een getal
// is, en alle velden zijn optioneel.
export const MKP_SPEC_VERSIE = 2;

// EAN-18 validatie: 18 cijfers, NL begint met 87, laatste cijfer = GS1
// modulo-10-controlecijfer (afwisselend ×3/×1 vanaf rechts, aanvullen tot
// tiental). Let op: dit is dus géén elfproef (die was van oude bankrekeningen).
export const eanValide = (ean) => {
  const s = String(ean || "").replace(/\s/g, "");
  if (!/^\d{18}$/.test(s)) return false;
  if (!s.startsWith("87")) return false;
  let som = 0;
  for (let i = 0; i < 17; i++) {
    const cijfer = s.charCodeAt(16 - i) - 48; // van rechts naar links, excl. controlecijfer
    som += cijfer * (i % 2 === 0 ? 3 : 1);
  }
  const controle = (10 - (som % 10)) % 10;
  return controle === (s.charCodeAt(17) - 48);
};

// ─── bytes ⇄ base64url ───────────────────────────────────────────────────────
// De lus is geen omslachtigheid maar noodzaak: String.fromCharCode(...bytes)
// zet elke byte als los argument op de stack, en een paspoort met veel groepen
// en logboekregels loopt daar tegenaan met een RangeError.
const _b64urlEnc = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const _b64urlDec = (s) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

// JSON → deflate-raw → base64url. CompressionStream is een standaard
// browser-API (iOS 16.4+ / Chrome 103+) — ruim gedekt op monteurstelefoons, en
// sinds Node 18 ook buiten de browser, waardoor dit te testen is.
export async function mkpEncode(obj) {
  const bron = new TextEncoder().encode(JSON.stringify(obj));
  const cs = new CompressionStream("deflate-raw");
  const gecomprimeerd = new Uint8Array(
    await new Response(new Blob([bron]).stream().pipeThrough(cs)).arrayBuffer()
  );
  return _b64urlEnc(gecomprimeerd);
}

export async function mkpDecode(fragment) {
  const bytes = _b64urlDec(String(fragment || "").trim());
  const ds = new DecompressionStream("deflate-raw");
  const json = await new Response(
    new Blob([bytes]).stream().pipeThrough(ds)
  ).text();
  const obj = JSON.parse(json);
  if (!obj || typeof obj.v !== "number") throw new Error("geen geldig meterkastpaspoort");
  return obj;
}

export async function mkpUrl(paspoort) {
  return MKP_BASIS + (await mkpEncode(paspoort));
}

// ─── Hergebruik van een bestaand paspoort ───────────────────────────────────
//
// Lezers negeren wat ze niet kennen (ontwerpprincipe 4). Voor SCHRIJVERS geldt
// de keerzijde: wie een bestaand paspoort hergebruikt, geeft door wat hij niet
// begrijpt. Een installateur die een laadpaal bijplaatst mag de materiaallijst,
// de erkenning, de zegels en de handtekeningen van zijn voorganger niet wissen —
// en zonder deze functie gebeurt precies dat, stil: de app bouwt een nieuw
// paspoort uit wat zij zelf kent, en alles daarbuiten verdwijnt zonder
// foutmelding. Zie claude_paspoortbehoud-featurespec.md.
//
//   bron   het gescande, onbewerkte paspoort (of null bij een nieuwe kast)
//   nieuw  wat de app zelf opbouwt: de velden die zij beheert
//
// Regels:
//   · alles uit de bron blijft staan, ook onbekende velden, tot op elke diepte;
//   · de velden die de app aanlevert winnen;
//   · grp[]: de app bouwt de lijst op, maar per groep blijven de sleutels van de
//     bijbehorende bronregel staan die de app niet aanlevert (vooral fn en mat).
//     Koppelen op t + n als beide bestaan, anders op positie — maar nooit twee
//     groepen van een verschillend type aan elkaar: een laadpaal die het
//     fasenummer van een kookgroep erft is erger dan een ontbrekend fasenummer;
//   · log[] is historie en wordt nooit herschreven. Nieuwe regels komen bovenaan;
//     bestaande regels blijven byte-voor-byte zoals in de bron, inclusief erk,
//     zeg, sid en sig — ook als de app een gewijzigde kopie aanlevert;
//   · v gaat nooit omlaag.
const _isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const _kopie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

function _voegObjectSamen(bron, nieuw) {
  const uit = _isObj(bron) ? _kopie(bron) : {};
  for (const [k, w] of Object.entries(nieuw || {})) {
    if (w === undefined) continue;
    uit[k] = _isObj(w) && _isObj(uit[k]) ? _voegObjectSamen(uit[k], w) : _kopie(w);
  }
  return uit;
}

function _koppelGroepen(bronGrp, nieuwGrp) {
  const bron = Array.isArray(bronGrp) ? bronGrp : [];
  const gebruikt = new Set();
  const koppeling = new Array(nieuwGrp.length).fill(-1);
  // Eerst alle zekere koppelingen op type + omschrijving, zodat een koppeling op
  // positie nooit een bronregel wegkaapt die elders een echte treffer had.
  nieuwGrp.forEach((g, i) => {
    if (!g || !g.t || !g.n) return;
    const j = bron.findIndex((b, k) => !gebruikt.has(k) && b && b.t === g.t && b.n === g.n);
    if (j >= 0) { koppeling[i] = j; gebruikt.add(j); }
  });
  nieuwGrp.forEach((g, i) => {
    if (koppeling[i] >= 0 || (g && g.t && g.n) || i >= bron.length || gebruikt.has(i)) return;
    const b = bron[i];
    if (g && b && g.t && b.t && g.t !== b.t) return;   // ander type: niet koppelen
    koppeling[i] = i; gebruikt.add(i);
  });
  return nieuwGrp.map((g, i) => (koppeling[i] >= 0 ? _voegObjectSamen(bron[koppeling[i]], g) : _kopie(g)));
}

function _voegLogSamen(bronLog, nieuwLog) {
  const bron = Array.isArray(bronLog) ? bronLog : [];
  // Een regel is "dezelfde" als datum, bedrijf en omschrijving gelijk zijn. Levert
  // de app een bestaande regel aan — eventueel zonder de velden die zij niet kent —
  // dan telt de bronversie, zodat een handtekening nooit ongemerkt wegvalt.
  const sleutel = (r) => JSON.stringify([r && r.d, r && r.b, r && r.w]);
  const bekend = new Set(bron.map(sleutel));
  const nieuweRegels = (Array.isArray(nieuwLog) ? nieuwLog : []).filter((r) => !bekend.has(sleutel(r)));
  return [...nieuweRegels.map(_kopie), ...bron.map(_kopie)];
}

export function mkpSamenvoegen(bron, nieuw) {
  // Geen of onbruikbare bron: gedraag je precies als zonder hergebruik. Een
  // beschadigde import mag nooit de hele klus laten mislukken.
  if (!_isObj(bron)) return _kopie(nieuw || {});
  const n = nieuw || {};
  const { grp, log, ...rest } = n;
  const uit = _voegObjectSamen(bron, rest);
  if (Array.isArray(grp)) uit.grp = _koppelGroepen(bron.grp, grp);
  if (Array.isArray(log) || Array.isArray(bron.log)) uit.log = _voegLogSamen(bron.log, log);
  const vb = typeof bron.v === "number" ? bron.v : 1, vn = typeof n.v === "number" ? n.v : 1;
  uit.v = Math.max(vb, vn);
  return uit;
}

// Zegelnummers van één logboekregel als lijst (hoofdstuk 9). Het veld is een
// lijst; een los nummer wordt net zo gelezen als de lezer dat doet.
export function mkpZegels(regel) {
  const z = regel && regel.zeg;
  return Array.isArray(z) ? z.map(String) : (z ? [String(z)] : []);
}

// Korte leesbare samenvatting van een (gescand) paspoort, voor de UI.
export function mkpSamenvatting(p) {
  if (!p) return "meterkastpaspoort";
  const delen = [];
  if (p.pc || p.nr) delen.push(`${p.pc || ""} ${p.nr || ""}`.trim());
  if (p.ha) delen.push(`${p.ha.f || "?"}×${p.ha.a || "?"}A`);
  if (p.kam) delen.push(`kam ${p.kam.a || "?"}A`);
  if (p.bj) delen.push(`aanleg ${p.bj}`);
  if (Array.isArray(p.grp)) delen.push(`${p.grp.length} groepen`);
  if (p.log && p.log[0]) delen.push(`laatst: ${p.log[0].b} (${p.log[0].d})`);
  return delen.join(" · ") || "meterkastpaspoort";
}

// Een QR die te veel tekens draagt wordt in de praktijk niet meer gelezen van
// een sticker op een kastdeur. Boven deze grens waarschuwen we, in plaats van
// stilletjes een onleesbare code af te drukken.
export const QR_TEKENS_GRENS = 1200;

export function qrWaarschuwing(tekens) {
  if (tekens <= QR_TEKENS_GRENS) return "";
  return `De QR draagt ${tekens} tekens en wordt daarmee dicht. Kort de groepsnamen in of laat de logboekhistorie weg.`;
}

// ─── Omvang van de QR-code: grens en afkapvolgorde (hoofdstuk 6) ─────────────
//
// De begrenzing zit niet in de QR maar in de sticker. Op 50 mm met 2 mm marge
// is 46 mm bedrukbaar; bij 203 dpi wordt een module onder ~3,5 punten
// onbetrouwbaar. Richtlijn: onder de 105 modules blijven.
export const QR_MODULES_GRENS = 105;
export const QR_NIVEAU = "M";

// Bytecapaciteit per QR-versie 1–40 op foutcorrectieniveau M, bytemodus
// (ISO/IEC 18004). Afgeleid uit de qrcode-bibliotheek en getoetst aan de
// meettabel in hoofdstuk 6: URL's van 517, 570, 670, 731 en 858 tekens geven
// daar 89, 93, 101, 105 en 113 modules — deze tabel ook. Op niveau L of Q klopt
// die tabel niet, dus M is het niveau waarop de grens van 105 gemeten is.
// Zuivere bytemodus is de veilige kant: een encoder die modi mengt komt
// hooguit kleiner uit, nooit groter.
const _BYTES_M = [14,26,42,62,84,106,122,152,180,213,251,287,331,362,412,450,504,560,624,666,
                  711,779,857,911,997,1059,1125,1190,1264,1370,1452,1538,1628,1722,1809,1911,1989,2099,2213,2331];

// Aantal modules (zijde van het vierkant) voor een URL van zoveel tekens.
export function qrModules(tekens) {
  const v = _BYTES_M.findIndex((cap) => cap >= tekens);
  return v < 0 ? Infinity : 17 + 4 * (v + 1);
}

// Past het paspoort niet onder de grens, dan valt er in een VASTE volgorde iets
// weg, zodat alle implementaties dezelfde gegevens als eerste laten vallen
// (featurespec paspoortbehoud §5, hoofdstuk 6):
//
//   1. de oudste logboekregels, van onderen af — de nieuwste blijft altijd staan;
//   2. sn en pd van toestellen zonder art: zonder artikelnummer matcht een
//      terugroepactie toch niet betrouwbaar;
//   3. hele mat-regels, te beginnen bij toestellen zonder art én zonder sn;
//   4. als laatste de vrije omschrijvingen van de groepen (grp[].n) inkorten.
//
// Twee dingen gebeuren NOOIT. Een logboekregel wordt alleen in zijn geheel
// weggelaten, nooit ingekort: het logboek is historie, en een ondertekende regel
// die je wijzigt is een vervalste regel. En er wordt nooit afgekapt op grond van
// een onbekend veld — past het daarna nog niet, dan zegt de uitkomst dat, en
// blijft het onbekende veld staan.
//
// Geeft terug: { paspoort, modules, past, weggelaten, melding }. `melding` is de
// ene regel die de app bij afkappen toont; leeg als er niets is weggelaten.
export async function mkpAfkappen(paspoort, { maxModules = QR_MODULES_GRENS } = {}) {
  const p = _kopie(paspoort) || {};
  const weg = { logregels: 0, detailvelden: 0, matregels: 0, omschrijvingen: 0 };
  let modules = qrModules((await mkpUrl(p)).length);
  const meet = async () => { modules = qrModules((await mkpUrl(p)).length); };
  const past = () => modules <= maxModules;

  // 1. Oudste logboekregels.
  while (!past() && Array.isArray(p.log) && p.log.length > 1) {
    p.log.pop(); weg.logregels++; await meet();
  }
  // 2. sn en pd van toestellen zonder art, van achteren naar voren.
  if (Array.isArray(p.mat)) {
    for (let i = p.mat.length - 1; i >= 0 && !past(); i--) {
      const m = p.mat[i];
      if (!_isObj(m) || m.art || !("sn" in m || "pd" in m)) continue;
      delete m.sn; delete m.pd; weg.detailvelden++; await meet();
    }
  }
  // 3. Hele mat-regels: eerst zonder art én zonder sn, daarna de rest.
  if (Array.isArray(p.mat)) {
    for (const eerst of [true, false]) {
      for (let i = p.mat.length - 1; i >= 0 && !past(); i--) {
        const m = p.mat[i];
        if (eerst && _isObj(m) && (m.art || m.sn)) continue;
        p.mat.splice(i, 1); weg.matregels++; await meet();
      }
    }
  }
  // 4. Vrije omschrijvingen van de groepen, eerst tot 24 en zo nodig tot 12 tekens.
  if (Array.isArray(p.grp)) {
    const ingekort = new Set();
    for (const grens of [24, 12]) {
      for (let i = p.grp.length - 1; i >= 0 && !past(); i--) {
        const g = p.grp[i];
        if (!_isObj(g) || typeof g.n !== "string" || g.n.length <= grens) continue;
        g.n = g.n.slice(0, grens - 1) + "…"; ingekort.add(i); await meet();
      }
    }
    weg.omschrijvingen = ingekort.size;
  }

  const mv = (n, enk, mvv) => `${n} ${n === 1 ? enk : mvv}`;
  const delen = [];
  if (weg.logregels) delen.push(`${mv(weg.logregels, "oudste logboekregel", "oudste logboekregels")} weggelaten`);
  if (weg.detailvelden) delen.push(`serienummer en productiecode weggelaten bij ${mv(weg.detailvelden, "toestel", "toestellen")} zonder artikelnummer`);
  if (weg.matregels) delen.push(`${mv(weg.matregels, "toestel", "toestellen")} uit de materiaallijst weggelaten`);
  if (weg.omschrijvingen) delen.push(`${mv(weg.omschrijvingen, "groepsomschrijving", "groepsomschrijvingen")} ingekort`);
  // Hoofdstuk 6: meld wat niet is meegenomen, "zodat die het volledige overzicht in
  // het opleverdocument kan opzoeken".
  let melding = delen.length ? `Om de QR leesbaar te houden: ${delen.join(", ")}. Het volledige overzicht staat in het opleverdocument.` : "";
  if (!past()) melding = (melding ? melding + " " : "") +
    `De code blijft ${modules === Infinity ? "te groot voor een QR" : modules + " modules"} — te dicht voor een sticker van 50 mm.`;
  return { paspoort: p, modules, past: past(), weggelaten: weg, melding };
}

