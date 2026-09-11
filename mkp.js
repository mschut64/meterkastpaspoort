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
//   npm i github:mschut64/meterkastpaspoort
//   import { mkpEncode, mkpDecode, eanValide } from "meterkastpaspoort";
//
// Licentie CC BY 4.0, net als de specificatie.
// ─────────────────────────────────────────────────────────────────────────────

export const MKP_BASIS = "https://meterkastpaspoort.nl/p#";

// v2 = spec v0.2, zoals gepubliceerd op meterkastpaspoort.nl. Belangrijkste
// wijziging voor ons: `grp[].fn` — de LIJST fasenummers waarop een groep is
// aangesloten ([1], [2], [3] of [1,2,3]). In v0.1 kon `f` óók een fasenummer
// bevatten, wat tot verwarring leidde; sinds v0.2 is `f` alleen nog het AANTAL
// fasen en staat het nummer in `fn`.
//
// Let op voor implementatiebouwers: er bestaan apps die hier `fase: "L2"`
// schrijven. Dat veld staat niet in deze specificatie en lezer.html kent het
// niet. Schrijf `fn`.
//
// Nog niet geïmplementeerd uit v0.2: `mat[]` (materiaal in de kast, met
// grp[].mat als verwijzing), `erk` in de logboekregel (erkenning als
// uitgever:nummer, hoort bij R2) en `sid`/`sig` (Ed25519-ondertekening per
// logboekregel).
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
