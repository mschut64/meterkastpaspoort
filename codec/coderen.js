// Lezen en schrijven: een paspoort heen en terug tussen JSON en het base64url-fragment achter /p#, met begrensd uitpakken.
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

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

// ─── GRENZEN VÓÓR HET UITPAKKEN (decompressiebom) ────────────────────────────
//
// Een paspoort is invoer die volledig door een vreemde wordt bepaald: iemand
// plakt een eigen sticker op een kast, of stuurt een link. Deflate pakt tot ruim
// duizend keer uit; een link van één megabyte kan zo een gigabyte worden en de
// telefoon laten vastlopen. Een QR-sticker draagt hooguit een paar kilobyte, maar
// een link is onbegrensd. (Dreigingsbeeld 13-10-2026, §3.1.)
//
// Twee grenzen, allebei ruim boven elk echt paspoort:
//   • het fragment zelf: een QR van 105 modules draagt ongeveer 1,9 kB, een
//     QR in het algemeen hooguit ~4 kB — 16 000 tekens laat ruimte voor links;
//   • de UITGEPAKTE omvang: 64 kB, gemeten tijdens het uitpakken. Wordt de grens
//     gepasseerd, dan stopt het uitpakken meteen — niet achteraf meten, want dan
//     is het geheugen al vol.
export const MKP_MAX_FRAGMENT = 16000;
export const MKP_MAX_UITGEPAKT = 64 * 1024;

async function _inflateBegrensd(bytes, max) {
  const lezer = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const delen = [];
  let totaal = 0;
  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    totaal += value.length;
    if (totaal > max) {
      await lezer.cancel().catch(() => {});
      throw new Error("geen geldig meterkastpaspoort: uitgepakt groter dan " + Math.round(max / 1024) + " kB");
    }
    delen.push(value);
  }
  const uit = new Uint8Array(totaal);
  let i = 0;
  for (const d of delen) { uit.set(d, i); i += d.length; }
  return uit;
}

export async function mkpDecode(fragment) {
  const tekst = String(fragment || "").trim();
  if (tekst.length > MKP_MAX_FRAGMENT) throw new Error("geen geldig meterkastpaspoort: te lang");
  const bytes = _b64urlDec(tekst);
  const json = new TextDecoder().decode(await _inflateBegrensd(bytes, MKP_MAX_UITGEPAKT));
  const obj = JSON.parse(json);
  if (!obj || typeof obj.v !== "number") throw new Error("geen geldig meterkastpaspoort");
  return obj;
}

export async function mkpUrl(paspoort) {
  return MKP_BASIS + (await mkpEncode(paspoort));
}
