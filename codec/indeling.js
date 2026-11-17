// Het indelingsblok (voorstel v0.4, bijgesteld): een lijst toestellen op de rails inpakken tot bytes en base64url-tekst, en terug — exact, of met een fout die veld en waarde noemt.
// (Nog door niets aangeroepen: het blok gaat nog niet in de QR. Zie voorstel/v04-indeling-bijgesteld.md.)
//
// Een toestel is een gewoon object met leesbare velden, bijvoorbeeld
//   { soort: "automaat", breedte: 1, polen: "1P+N", In: 16, kar: "B", groep: 3 }
// Polen: "2P" en "4P" worden bij het inpakken 1P+N en 3P+N; uitpakken geeft altijd de vorm met +N.
// Welke velden een soort draagt staat in INDELING_VELDEN. Een veld dat ontbreekt
// (of null is, of selectief: false) is "niet vastgelegd" en komt bij het
// uitpakken niet terug. Een waarde die niet in de tabel staat geeft een fout;
// er wordt nooit afgerond.

import {
  INDELING_VERSIE, INDELING_BITS, INDELING_SOORTEN, INDELING_VELDEN, INDELING_POLEN,
  INDELING_POLEN_ALIAS, INDELING_STROMEN, INDELING_KARAKTERISTIEKEN, INDELING_AANSPREEKSTROMEN, INDELING_AARDLEKTYPEN,
  INDELING_STATUS, INDELING_WARMTEROUTE, INDELING_GROEP_MAX, INDELING_BREEDTE_MAX,
  INDELING_AANTAL_MAX, INDELING_MPR_MAX, INDELING_NAAM_MAX,
} from "./indeling-tabellen.js";

// ─── fouten ──────────────────────────────────────────────────────────────────
function fout(bericht, extra = {}) {
  const e = new Error(`indeling: ${bericht}`);
  Object.assign(e, extra);
  return e;
}
const toon = (w) => (typeof w === "string" ? JSON.stringify(w) : String(w));

// ─── bits ────────────────────────────────────────────────────────────────────
class BitSchrijver {
  constructor() { this.bytes = []; this.acc = 0; this.n = 0; }
  schrijf(waarde, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((waarde >>> i) & 1);
      if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; }
    }
  }
  sluit() { if (this.n) { this.bytes.push(this.acc << (8 - this.n)); this.acc = 0; this.n = 0; } }
}

class BitLezer {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }  // pos in bits
  lees(bits, wat) {
    if (this.pos + bits > this.bytes.length * 8) throw fout(`afgekapt: ${wat} valt buiten de invoer`, { veld: wat });
    let w = 0;
    for (let i = 0; i < bits; i++, this.pos++) w = (w << 1) | ((this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
    return w >>> 0;
  }
  // Naar de volgende bytegrens; de opvulbits moeten nul zijn.
  lijnUit() {
    const rest = (8 - (this.pos & 7)) & 7;
    if (rest && this.lees(rest, "opvulling") !== 0) throw fout("opvulbits na de toestellen zijn niet nul", { veld: "opvulling" });
  }
  get byte() { return this.pos >> 3; }
}

// ─── base64url, streng ───────────────────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function naarTekst(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const tekens = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < tekens; j++) s += B64[(n >> (18 - 6 * j)) & 63];
  }
  return s;
}
function uitTekst(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw fout("tekst bevat tekens buiten base64url", { veld: "tekst", waarde: s });
  if (s.length % 4 === 1) throw fout("tekst heeft een onmogelijke lengte (afgekapt?)", { veld: "tekst", waarde: s });
  const bytes = new Uint8Array(Math.floor((s.length * 6) / 8));
  let acc = 0, n = 0, k = 0;
  for (const c of s) {
    acc = (acc << 6) | B64.indexOf(c); n += 6;
    if (n >= 8) { n -= 8; bytes[k++] = (acc >> n) & 255; }
  }
  if (acc & ((1 << n) - 1)) throw fout("tekst is geen zuivere base64url (losse bits aan het eind)", { veld: "tekst", waarde: s });
  return bytes;
}

// ─── velden: waarde ⇄ code ───────────────────────────────────────────────────
const TABEL = {
  polen: INDELING_POLEN, In: INDELING_STROMEN, kar: INDELING_KARAKTERISTIEKEN,
  idn: INDELING_AANSPREEKSTROMEN, lek: INDELING_AARDLEKTYPEN,
};

function codeVan(veld, w, waar) {
  const leeg = w === undefined || w === null;
  if (veld === "breedte") {
    if (leeg) throw fout(`${waar}: breedte ontbreekt`, { veld, waarde: w });
    if (!Number.isInteger(w) || w < 1 || w > INDELING_BREEDTE_MAX)
      throw fout(`${waar}: breedte ${toon(w)} ligt niet tussen 1 en ${INDELING_BREEDTE_MAX}`, { veld, waarde: w });
    return w - 1;
  }
  if (leeg) return 0;
  if (veld === "selectief") {
    if (typeof w !== "boolean") throw fout(`${waar}: selectief ${toon(w)} is geen true of false`, { veld, waarde: w });
    return w ? 1 : 0;
  }
  if (veld === "groep") {
    if (!Number.isInteger(w) || w < 1 || w > INDELING_GROEP_MAX)
      throw fout(`${waar}: groep ${toon(w)} ligt niet tussen 1 en ${INDELING_GROEP_MAX}`, { veld, waarde: w });
    return w;
  }
  // 2P en 4P zijn schrijfwijzen van 1P+N en 3P+N (besluit 17-11-2026).
  if (veld === "polen" && Object.hasOwn(INDELING_POLEN_ALIAS, w)) w = INDELING_POLEN_ALIAS[w];
  const code = TABEL[veld].indexOf(w);
  if (code < 1) throw fout(`${waar}: ${veld} ${toon(w)} staat niet in de tabel`, { veld, waarde: w });
  return code;
}

function waardeVan(veld, code, waar) {
  if (veld === "breedte") return code + 1;
  if (veld === "selectief") return code === 1 ? true : undefined;
  if (code === 0) return undefined;
  if (veld === "groep") return code;
  const w = TABEL[veld][code];
  if (w === null || w === undefined) throw fout(`${waar}: onbekende code ${code} voor ${veld}`, { veld, waarde: code });
  return w;
}

const utf8 = new TextEncoder();

// ─── inpakken ────────────────────────────────────────────────────────────────
/**
 * Pakt een indeling in.
 * @param {{ st: string, wr?: string, mpr?: number, toestellen: object[] }} indeling
 *   st: "gemeten" | "ontworpen" | "gebouwd" (verplicht: geen stille standaard)
 *   wr: "onbekend" (standaard) | "beproefd" | "afgeleid" | "berekend"
 *   mpr: modules per rail, 1–255; weglaten = niet vastgelegd
 * @returns {{ bytes: Uint8Array, tekst: string }}
 */
export function mkpIndelingInpakken(indeling) {
  if (!indeling || typeof indeling !== "object") throw fout("geen indeling meegegeven", { veld: "indeling", waarde: indeling });
  const { st, wr = "onbekend", mpr, toestellen } = indeling;
  for (const k of Object.keys(indeling))
    if (!["st", "wr", "mpr", "toestellen"].includes(k)) throw fout(`onbekend veld ${toon(k)} (= ${toon(indeling[k])}) in de kop`, { veld: k, waarde: indeling[k] });

  const stCode = INDELING_STATUS.indexOf(st);
  if (st === null || stCode < 0) throw fout(`st ${toon(st)} staat niet in de tabel`, { veld: "st", waarde: st });
  const wrCode = INDELING_WARMTEROUTE.indexOf(wr);
  if (wrCode < 0) throw fout(`wr ${toon(wr)} staat niet in de tabel`, { veld: "wr", waarde: wr });
  let mprCode = 0;
  if (mpr !== undefined && mpr !== null) {
    if (!Number.isInteger(mpr) || mpr < 1 || mpr > INDELING_MPR_MAX)
      throw fout(`mpr ${toon(mpr)} ligt niet tussen 1 en ${INDELING_MPR_MAX}`, { veld: "mpr", waarde: mpr });
    mprCode = mpr;
  }
  if (!Array.isArray(toestellen)) throw fout("toestellen is geen lijst", { veld: "toestellen", waarde: toestellen });
  if (toestellen.length > INDELING_AANTAL_MAX)
    throw fout(`${toestellen.length} toestellen, het maximum is ${INDELING_AANTAL_MAX}`, { veld: "toestellen", waarde: toestellen.length });

  const namen = [];
  const records = new BitSchrijver();
  toestellen.forEach((t, i) => {
    const waar = `toestel ${i + 1}`;
    if (!t || typeof t !== "object" || Array.isArray(t)) throw fout(`${waar} is geen object`, { toestel: i, veld: "toestel", waarde: t });
    if (t.soort === "kamrail")
      throw fout(`${waar}: een kamrail staat niet in de indeling; leg hem één keer per kast vast in het paspoortveld "kam" (de kamrail is overal in de kast hetzelfde)`, { toestel: i, veld: "soort", waarde: t.soort });
    const code = typeof t.soort === "string" ? INDELING_SOORTEN.indexOf(t.soort) : -1;
    if (code < 0) throw fout(`${waar}: soort ${toon(t.soort)} staat niet in de tabel`, { toestel: i, veld: "soort", waarde: t.soort });
    const velden = INDELING_VELDEN[t.soort];
    const toegestaan = ["soort", ...velden, ...(t.soort === "overig" ? ["naam"] : [])];
    for (const k of Object.keys(t))
      if (!toegestaan.includes(k)) throw fout(`${waar} (${t.soort}): veld ${toon(k)} (= ${toon(t[k])}) hoort niet bij deze soort`, { toestel: i, veld: k, waarde: t[k] });
    records.schrijf(code, INDELING_BITS.soort);
    for (const veld of velden) {
      try { records.schrijf(codeVan(veld, t[veld], `${waar} (${t.soort})`), INDELING_BITS[veld]); }
      catch (e) { e.toestel = i; throw e; }
    }
    if (t.soort === "overig") {
      const naam = t.naam;
      if (naam !== undefined && naam !== null && typeof naam !== "string")
        throw fout(`${waar} (overig): naam ${toon(naam)} is geen tekst`, { toestel: i, veld: "naam", waarde: naam });
      const b = utf8.encode(naam || "");
      if (b.length > INDELING_NAAM_MAX)
        throw fout(`${waar} (overig): naam ${toon(naam)} is ${b.length} bytes, het maximum is ${INDELING_NAAM_MAX}`, { toestel: i, veld: "naam", waarde: naam });
      namen.push(b);
    }
  });
  records.sluit();

  const metNamen = namen.some((b) => b.length > 0);
  const kop = new BitSchrijver();
  kop.schrijf(INDELING_VERSIE, INDELING_BITS.versie);
  kop.schrijf(stCode, INDELING_BITS.st);
  kop.schrijf(wrCode, INDELING_BITS.wr);
  kop.schrijf(mprCode, INDELING_BITS.mpr);
  kop.schrijf(toestellen.length, INDELING_BITS.aantal);
  kop.schrijf(metNamen ? 1 : 0, INDELING_BITS.namen);
  kop.schrijf(0, INDELING_BITS.reserve);

  const delen = [...kop.bytes, ...records.bytes];
  if (metNamen) for (const b of namen) delen.push(b.length, ...b);
  const bytes = Uint8Array.from(delen);
  return { bytes, tekst: naarTekst(bytes) };
}

// ─── uitpakken ───────────────────────────────────────────────────────────────
/**
 * Pakt een indeling uit, uit bytes (Uint8Array) of uit de base64url-tekst.
 * @returns {{ versie, st, wr, mpr?, toestellen }} — of, bij een blokversie die
 *   deze lezer niet kent: { overgeslagen: true, versie }. Kapotte of afgekapte
 *   invoer geeft een fout, nooit een half resultaat.
 */
export function mkpIndelingUitpakken(invoer) {
  let bytes;
  if (typeof invoer === "string") bytes = uitTekst(invoer);
  else if (invoer instanceof Uint8Array) bytes = invoer;
  else throw fout("invoer is geen tekst en geen Uint8Array", { veld: "invoer", waarde: invoer });

  const r = new BitLezer(bytes);
  const versie = r.lees(INDELING_BITS.versie, "versie");
  if (versie === 0) throw fout("blokversie 0 bestaat niet", { veld: "versie", waarde: 0 });
  if (versie !== INDELING_VERSIE) return { overgeslagen: true, versie };

  const st = INDELING_STATUS[r.lees(INDELING_BITS.st, "st")];
  if (!st) throw fout("onbekende code voor st", { veld: "st" });
  const wr = INDELING_WARMTEROUTE[r.lees(INDELING_BITS.wr, "wr")];
  const mpr = r.lees(INDELING_BITS.mpr, "mpr");
  const aantal = r.lees(INDELING_BITS.aantal, "aantal");
  const metNamen = r.lees(INDELING_BITS.namen, "namen") === 1;
  const reserve = r.lees(INDELING_BITS.reserve, "reserve");
  if (reserve !== 0) throw fout(`gereserveerde kopbits zijn niet nul (${reserve})`, { veld: "reserve", waarde: reserve });

  const toestellen = [];
  for (let i = 0; i < aantal; i++) {
    const waar = `toestel ${i + 1}`;
    const code = r.lees(INDELING_BITS.soort, `${waar}: soort`);
    const soort = INDELING_SOORTEN[code];
    const t = soort ? { soort } : { soort: "gereserveerd", code };
    for (const veld of INDELING_VELDEN[soort || "gereserveerd"]) {
      const w = waardeVan(veld, r.lees(INDELING_BITS[veld], `${waar}: ${veld}`), `${waar} (${t.soort})`);
      if (w !== undefined) t[veld] = w;
    }
    toestellen.push(t);
  }
  r.lijnUit();

  if (metNamen) {
    const dec = new TextDecoder("utf-8", { fatal: true });
    const overig = toestellen.filter((t) => t.soort === "overig");
    if (!overig.length) throw fout("de kop meldt namen, maar er is geen toestel 'overig'", { veld: "namen" });
    for (const t of overig) {
      if (r.byte >= bytes.length) throw fout("afgekapt: de namenlijst is korter dan het aantal toestellen 'overig'", { veld: "naam" });
      const len = bytes[r.byte];
      if (len > INDELING_NAAM_MAX) throw fout(`naam van ${len} bytes, het maximum is ${INDELING_NAAM_MAX}`, { veld: "naam", waarde: len });
      const start = r.byte + 1;
      if (start + len > bytes.length) throw fout("afgekapt: een naam valt buiten de invoer", { veld: "naam" });
      let naam;
      try { naam = dec.decode(bytes.subarray(start, start + len)); }
      catch { throw fout("een naam is geen geldige UTF-8", { veld: "naam" }); }
      if (naam) t.naam = naam;
      r.pos = (start + len) * 8;
    }
  }
  if (r.byte !== bytes.length) throw fout(`${bytes.length - r.byte} byte(s) na het einde van het blok`, { veld: "einde" });

  const uit = { versie, st, wr };
  if (mpr) uit.mpr = mpr;
  uit.toestellen = toestellen;
  return uit;
}
