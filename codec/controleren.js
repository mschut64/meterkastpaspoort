// Controleren: handtekening per logregel, de index, erkenning, zegels en veldnotities (hoofdstuk 8 t/m 10).
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

// ─────────────────────────────────────────────────────────────────────────────
// Controleren: handtekeningen, erkenning en veldnotities (hoofdstuk 8 t/m 10)
//
// Wat lezer.html inline deed, als pure functies — zodat elke lezende toepassing
// (YourWkb, Kastscan, de lezer zelf) hetzelfde vaststelt. Er verlaat geen enkel
// gegeven uit het paspoort het toestel: de index en de feeds zijn openbaar en
// voor iedereen gelijk; de vergelijking met mat[] gebeurt hier, lokaal.
//
// Het paspoort verifieert niets; het maakt controleerbaar. Een geldige
// handtekening zegt dat de regel onveranderd is en van de houder van die sleutel
// komt — niet dat de installatie deugt, en niet dat de sticker op de juiste kast zit.
// ─────────────────────────────────────────────────────────────────────────────

// Zegelnummers van één logboekregel als lijst (hoofdstuk 9). Het veld is een
// lijst; een los nummer wordt net zo gelezen als de lezer dat doet.
export function mkpZegels(regel) {
  const z = regel && regel.zeg;
  return Array.isArray(z) ? z.map(String) : (z ? [String(z)] : []);
}

// Rechtstreeks op www: het kale domein stuurt door (308), en die doorverwijzing
// draagt geen Access-Control-Allow-Origin — een browser blokkeert het ophalen dan.
export const MKP_INDEX_URL = "https://www.meterkastpaspoort.nl/veldnotities/index.json";
export const MKP_DEMO_FEED_URL = "https://www.meterkastpaspoort.nl/veldnotities/demo-feed.json";

// De sleutel van de beheerder van de standaard, VASTGEPIND in de code. Wie hem
// uit de index zelf haalt, laat de index zijn eigen echtheid bevestigen: wie de
// index kan vervangen, vervangt dan ook deze sleutel (§8.4, "die derde wordt
// vaak vergeten").
export const MKP_WORTEL_SLEUTEL = "1lSbZH2ARRsbVri6ML1M-5wce0z0pfsMV_a16UNsY6M";

const _unb64 = (s) => {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

// Canonieke bytes waarover getekend wordt: sleutels gesorteerd, geen spaties.
export function mkpCanon(obj) {
  const sorteer = (x) => Array.isArray(x) ? x.map(sorteer)
    : (x && typeof x === "object")
      ? Object.keys(x).sort().reduce((a, k) => (a[k] = sorteer(x[k]), a), {})
      : x;
  return new TextEncoder().encode(JSON.stringify(sorteer(obj)));
}

// "geen" (niet ondertekend) · "onbekend" (sleutel onbekend of Ed25519 niet
// beschikbaar) · "geldig" · "ongeldig". Getekend wordt over het object zónder het
// handtekeningveld.
export async function mkpVerifieer(obj, veld, publiekeSleutel) {
  if (!obj || !obj[veld]) return "geen";
  if (!publiekeSleutel) return "onbekend";
  try {
    const kopie = { ...obj }; const sig = kopie[veld]; delete kopie[veld];
    const key = await crypto.subtle.importKey("raw", _unb64(publiekeSleutel), { name: "Ed25519" }, false, ["verify"]);
    return (await crypto.subtle.verify({ name: "Ed25519" }, key, _unb64(sig), mkpCanon(kopie))) ? "geldig" : "ongeldig";
  } catch {
    return "onbekend";
  }
}

// log[].erk ("installq:14718") uiteengelegd, met de controleplek uit de index.
export function mkpErkenning(regel, index) {
  const erk = regel && typeof regel.erk === "string" ? regel.erk : "";
  const i = erk.indexOf(":");
  if (i <= 0 || i === erk.length - 1) return null;
  const uitgever = erk.slice(0, i), nummer = erk.slice(i + 1);
  const e = index && Array.isArray(index.erkenners) ? index.erkenners.find((x) => x && x.id === uitgever) : null;
  const opzoek = e && typeof e.opzoek === "string"
    ? e.opzoek.replace("{nummer}", encodeURIComponent(nummer)) : null;
  return { uitgever, nummer, naam: (e && e.naam) || uitgever, opzoek };
}

// Veldnotities uit één feed die op het materiaal in dit paspoort slaan. Treffer
// op artikelnummer, of anders op fabrikant + type ("mogelijk van toepassing").
// Of het exemplaar zelf geraakt is, stelt de lezer vast met de identificatie
// uit de notitie — de productiecode staat erbij.
export function mkpVeldnotities(paspoort, feed) {
  const mat = paspoort && Array.isArray(paspoort.mat) ? paspoort.mat : [];
  const uit = [];
  if (!feed || !Array.isArray(feed.notities) || !mat.length) return uit;
  const klein = (s) => String(s || "").trim().toLowerCase();
  for (const n of feed.notities) {
    if (!n || n.status !== "actueel") continue;
    for (const p of Array.isArray(n.producten) ? n.producten : []) {
      for (const m of mat) {
        if (!m) continue;
        const opArt = !!p.artikelnummer && String(p.artikelnummer) === String(m.art || "");
        const opTyp = klein(p.fabrikant) === klein(m.fab) && !!p.type && String(p.type) === String(m.typ || "");
        if (opArt || opTyp) uit.push({ notitie: n, product: p, toestel: m, treffer: opArt ? "artikelnummer" : "type" });
      }
    }
  }
  return uit;
}

// De index is ondertekend zonder het veld met de sleutel van de beheerder zelf:
// die sleutel is geen inhoud van de lijst, en hoort er alleen ter informatie in.
// (Zo is de index van 11-09-2026 ondertekend; wie dat veld meetelt, keurt een
// correct ondertekende index af.)
export async function mkpVerifieerIndex(index, wortel = MKP_WORTEL_SLEUTEL) {
  if (!index || typeof index !== "object") return "geen";
  const kopie = { ...index }; delete kopie.wortel_publieke_sleutel;
  return mkpVerifieer(kopie, "handtekening", wortel);
}

// Alles in één keer, voor een lezende toepassing. index en feeds zijn wat de app
// heeft kunnen ophalen (of eerder bewaard); zonder index blijven handtekeningen
// "onbekend" en is er niets om mee te vergelijken — het paspoort zelf blijft leesbaar.
export async function mkpControleer(paspoort, { index = null, feeds = [], wortel = MKP_WORTEL_SLEUTEL } = {}) {
  const indexStatus = index ? await mkpVerifieerIndex(index, wortel) : "geen";
  const installateurs = index && Array.isArray(index.installateurs) ? index.installateurs : [];
  const uitgevers = index && Array.isArray(index.uitgevers) ? index.uitgevers : [];

  const log = [];
  for (const r of paspoort && Array.isArray(paspoort.log) ? paspoort.log : []) {
    const ins = r && r.sid ? installateurs.find((x) => x && x.sleutel_id === r.sid) : null;
    log.push({
      regel: r,
      handtekening: await mkpVerifieer(r, "sig", ins && ins.publieke_sleutel),
      ondertekenaar: ins ? ins.naam : null,
      erkenning: mkpErkenning(r, index),
      zegels: mkpZegels(r),
    });
  }

  const notities = [];
  const gezien = new Set();
  for (const feed of Array.isArray(feeds) ? feeds : []) {
    const sid = feed && feed.uitgever && feed.uitgever.sleutel_id;
    if (!sid || gezien.has(sid)) continue;
    gezien.add(sid);
    const u = uitgevers.find((x) => x && x.sleutel_id === sid);
    const status = await mkpVerifieer(feed, "handtekening", u && u.publieke_sleutel);
    for (const t of mkpVeldnotities(paspoort, feed))
      notities.push({ ...t, uitgever: (u && u.naam) || feed.uitgever.naam || sid, feedStatus: status });
  }
  return { indexStatus, log, notities };
}
