// ─────────────────────────────────────────────────────────────────────────────
// Open Meterkastpaspoort — testsuite van de referentie-implementatie
//
// Toetst wat de specificatie belooft: dat een paspoort heen en terug gaat zonder
// verlies, dat onzin geweigerd wordt, dat de gegevens volledig in het
// URL-fragment zitten en dus nooit een server bereiken, en dat een grote kast
// niet op een technische grens stukloopt.
//
// Het echte coderen wordt getoetst, geen nabootsing: CompressionStream bestaat
// sinds Node 18 ook buiten de browser.
//
// Voer uit met:  npm test
// ─────────────────────────────────────────────────────────────────────────────

import {
  MKP_BASIS, MKP_SPEC_VERSIE, eanValide,
  mkpEncode, mkpDecode, mkpUrl, mkpSamenvatting,
  QR_TEKENS_GRENS, qrWaarschuwing,
  mkpSamenvoegen, mkpZegels, mkpAfkappen, qrModules, QR_MODULES_GRENS, QR_NIVEAU,
  mkpCanon, mkpVerifieer, mkpVerifieerIndex, mkpErkenning, mkpVeldnotities, mkpControleer, MKP_WORTEL_SLEUTEL,
} from "../mkp.js";
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}
async function gooit(fn, label) {
  try { await fn(); failed++; failures.push(`❌ ${label}\n     verwachtte een fout, kreeg er geen`); }
  catch { passed++; }
}

console.log("▶ CATEGORIE 1: EAN-18 controlecijfer (GS1 modulo-10)");

// Geldige Nederlandse EAN's: 18 cijfers, beginnen met 87, controlecijfer klopt.
eq(eanValide("871685920000000019"), true,  "1.1 geldige EAN (controlecijfer 9, narekenbaar)");
eq(eanValide("871685920000000018"), false, "1.2 verkeerd controlecijfer");
eq(eanValide("881685920000000019"), false, "1.3 begint niet met 87");
eq(eanValide("87168592000000001"),  false, "1.4 te kort (17 cijfers)");
eq(eanValide("8716859200000000191"), false,"1.5 te lang (19 cijfers)");
eq(eanValide("87168592000000001a"), false, "1.6 bevat een letter");
eq(eanValide("871000000000000013"), true,  "1.6b tweede geldige reeks");
eq(eanValide(""),                   false, "1.7 leeg");
eq(eanValide(null),                 false, "1.8 null");
eq(eanValide(" 8716 8592 0000 0000 19 "), true, "1.9 spaties worden genegeerd");

console.log("▶ CATEGORIE 2: coderen en decoderen (deflate-raw + base64url)");

const paspoort = {
  v: MKP_SPEC_VERSIE, d: "2026-09-11", pc: "2691JJ", nr: "72 a", bj: "1995",
  ha: { f: 3, a: 25 },
  kam: { mm2: 16, a: 63 },
  grp: [
    { t: "kook", rol: "af", f: 1, fn: [2], kw: 7.4, n: "Kookgroep" },
    { t: "lp",   rol: "af", f: 3, fn: [1,2,3], kw: 11 },
    { t: "pv",   rol: "voed", f: 1, fn: [1], kw: 4 },
  ],
  log: [{ d: "2026-09-11", b: "BlauweVisie", w: "laadpaal geplaatst" }],
};

const heen = await mkpEncode(paspoort);
const terug = await mkpDecode(heen);
eq(terug, paspoort, "2.1 heen en terug levert exact hetzelfde object");
eq(/^[A-Za-z0-9_-]+$/.test(heen), true, "2.2 uitvoer is base64url: geen +, / of =");

// De winst van comprimeren is de reden dat dit past op een sticker.
const ruw = JSON.stringify(paspoort).length;
eq(heen.length < ruw, true, `2.3 gecodeerd (${heen.length}) is korter dan ruw JSON (${ruw})`);

// De fase per apparaat is de toevoeging van v2 en moet de rit overleven.
eq(terug.grp[0].fn, [2], "2.4 fasenummer per apparaat blijft behouden");
eq(terug.grp[1].fn, [1,2,3], "2.5 3-fasegroep draagt alle drie de fasen");
eq(MKP_SPEC_VERSIE, 2, "2.6 spec-versie staat op 2 (v0.2)");

// Whitespace om het fragment heen komt voor bij plakken uit een bericht.
eq(await mkpDecode("  " + heen + "  "), paspoort, "2.7 spaties rond het fragment");

await gooit(() => mkpDecode("dit-is-geen-paspoort"), "2.8 onzin geeft een fout");
await gooit(() => mkpDecode(""), "2.9 leeg fragment geeft een fout");
await gooit(async () => {
  // Geldig gecomprimeerd, maar geen paspoort: `v` ontbreekt.
  const geen = await mkpEncode({ iets: "anders" });
  await mkpDecode(geen);
}, "2.10 geldige JSON zonder v wordt geweigerd");

console.log("▶ CATEGORIE 3: grote paspoorten (de stack-valkuil)");

// String.fromCharCode(...bytes) zet elke byte als los argument op de stack en
// loopt daarop stuk. Deze kast is groot maar niet onrealistisch: een verdeler
// met veertig eindgroepen en een vol logboek.
const groot = {
  v: MKP_SPEC_VERSIE, d: "2026-09-11", pc: "2691JJ", nr: "72",
  ha: { f: 3, a: 35 },
  grp: Array.from({ length: 40 }, (_, i) => ({
    t: "ov", rol: "af", f: 1, fn: [(i % 3) + 1], kw: 2.3,
    n: `Eindgroep ${i + 1} met een tamelijk lange omschrijving`,
  })),
  log: Array.from({ length: 8 }, (_, i) => ({
    d: `2026-0${(i % 9) + 1}-01`, b: `Installatiebedrijf nummer ${i}`,
    w: "werkzaamheden aan de verdeelinrichting uitgevoerd",
  })),
};
const grootHeen = await mkpEncode(groot);
eq(await mkpDecode(grootHeen), groot, "3.1 groot paspoort overleeft heen en terug");

console.log("▶ CATEGORIE 4: URL en leesbaarheidsgrens van de QR");

const url = await mkpUrl(paspoort);
eq(url.startsWith(MKP_BASIS), true, "4.1 url begint met de basis");
eq(url.startsWith("https://meterkastpaspoort.nl/p#"), true, "4.2 fragment achter /p#");
// De gegevens zitten ín het fragment: alles achter de # gaat nooit naar een
// server. Dat is de privacy-architectuur, dus die grens toetsen we.
eq(url.split("#")[1], heen, "4.3 de data staat volledig in het fragment");

eq(qrWaarschuwing(QR_TEKENS_GRENS), "", "4.4 precies op de grens: geen waarschuwing");
eq(qrWaarschuwing(QR_TEKENS_GRENS + 1) !== "", true, "4.5 erboven: wel een waarschuwing");
eq(url.length <= QR_TEKENS_GRENS, true, `4.6 een normale kast past ruim (${url.length} tekens)`);

console.log("▶ CATEGORIE 5: samenvatting voor de UI");

eq(mkpSamenvatting(paspoort), "2691JJ 72 a · 3×25A · kam 63A · aanleg 1995 · 3 groepen · laatst: BlauweVisie (2026-09-11)",
   "5.1 volledige samenvatting");
eq(mkpSamenvatting({}), "meterkastpaspoort", "5.2 leeg paspoort geeft de naam");
eq(mkpSamenvatting(null), "meterkastpaspoort", "5.3 null geeft de naam");
eq(mkpSamenvatting({ ha: { f: 1, a: 25 } }), "1×25A", "5.4 alleen aansluiting");

console.log("▶ CATEGORIE 6: hergebruik — onbekende velden blijven behouden");

// Het belangrijkste gedrag van deze module. Een installateur die een laadpaal
// bijplaatst mag de materiaallijst, de erkenning, de zegels en de handtekening
// van zijn voorganger niet wissen. Zonder mkpSamenvoegen gebeurt dat stil.
const { subtle } = globalThis.crypto;
const canon = (o) => { const s = (x) => Array.isArray(x) ? x.map(s) : (x && typeof x === "object") ? Object.keys(x).sort().reduce((a, k) => (a[k] = s(x[k]), a), {}) : x; return new TextEncoder().encode(JSON.stringify(s(o))); };
const sleutels = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
// Ondertekend zoals lezer.html controleert: over de canonieke regel zonder sig.
const regel = { d: "2026-05-02", b: "Installatiebedrijf Jansen", w: "groepenkast vervangen",
                erk: "installq:14718", zeg: ["IQ-14718-004217"], sid: "jansen-2026-01" };
regel.sig = Buffer.from(await subtle.sign({ name: "Ed25519" }, sleutels.privateKey, canon(regel))).toString("base64url");
const handtekeningKlopt = async (r) => { const k = { ...r }; const sig = k.sig; delete k.sig;
  return subtle.verify({ name: "Ed25519" }, sleutels.publicKey, Buffer.from(sig, "base64url"), canon(k)); };

const bron = {
  v: 2, d: "2026-05-02", pc: "2691JJ", nr: "72", xyz: 123,
  ha: { f: 3, a: 25, xyz: "genest onbekend veld" },
  mat: [{ i: 1, fab: "Hager", typ: "CDA440D", art: "CDA440D", sn: "A12345", pd: "2024-11", pos: "A1", xyz: 7 }],
  grp: [
    { t: "kook", rol: "af", f: 1, fn: [2], mat: 1, kw: 7.4, n: "Kookgroep", xyz: true },
    { t: "wp",   rol: "af", f: 1, fn: [3], kw: 6.9, n: "Warmtepomp" },
  ],
  log: [regel],
};
const bronVoor = JSON.stringify(bron);
// Wat een app zelf opbouwt: hij kent geen mat, geen fn en geen handtekening,
// zet de groepen in een andere volgorde, en levert de oude logboekregel aan als
// kaal kopietje zonder erk, zeg en sig.
const nieuw = {
  v: 2, d: "2026-09-18", pc: "2691JJ", nr: "72", ha: { f: 3, a: 25 },
  grp: [
    { t: "wp",   rol: "af", f: 1, kw: 6.9, n: "Warmtepomp" },
    { t: "kook", rol: "af", f: 1, kw: 7.4, n: "Kookgroep" },
    { t: "lp",   rol: "af", f: 1, kw: 11,  n: "Laadpaal" },
  ],
  log: [{ d: "2026-09-18", b: "BlauweVisie", w: "laadpaal bijgeplaatst" }, { d: regel.d, b: regel.b, w: regel.w }],
};
const her = mkpSamenvoegen(bron, nieuw);
eq(her.mat, bron.mat, "6.1 de materiaallijst van de voorganger blijft staan");
eq(her.xyz, 123, "6.2 een verzonnen veld \"xyz\": 123 blijft staan");
eq(her.ha.xyz, "genest onbekend veld", "6.3 ook een onbekend veld diep in een object");
eq(her.mat[0].xyz, 7, "6.4 en een onbekend veld in een materiaalregel");
const kook = her.grp.find(g => g.t === "kook"), wp = her.grp.find(g => g.t === "wp"), lp = her.grp.find(g => g.t === "lp");
eq([kook.fn, kook.mat, kook.xyz], [[2], 1, true], "6.5 kookgroep houdt fn, mat en xyz — ook in andere volgorde (koppeling op t + n)");
eq(wp.fn, [3], "6.6 warmtepomp houdt zijn fasenummer");
eq(lp.fn, undefined, "6.7 de nieuwe laadpaal erft geen fasenummer van een ander");
eq(her.log.length, 2, "6.8 één nieuwe regel erbij, geen dubbele");
eq(her.log[0].b, "BlauweVisie", "6.9 de nieuwe regel staat bovenaan");
eq(JSON.stringify(her.log[1]), JSON.stringify(regel), "6.10 de oude regel is byte-voor-byte gelijk, met erk, zeg, sid en sig");
const naRit = await mkpDecode(await mkpEncode(her));
eq(await handtekeningKlopt(naRit.log[1]), true, "6.11 de handtekening van de voorganger verifieert ná hergebruik nog");
eq(mkpZegels(naRit.log[1]), ["IQ-14718-004217"], "6.12 het zegelnummer is er nog");
eq(JSON.stringify(bron), bronVoor, "6.13 de bron zelf wordt niet gewijzigd");
eq(mkpSamenvoegen({ ...bron, v: 3 }, nieuw).v, 3, "6.14 v gaat nooit omlaag");
eq(mkpSamenvoegen(null, nieuw), nieuw, "6.15 geen bron: precies wat de app aanlevert");
eq(mkpSamenvoegen("rommel", nieuw), nieuw, "6.16 onleesbare bron: negeren, niet mislukken");
eq(mkpSamenvoegen({ v: 2, grp: [{ t: "kook", fn: [2] }] }, { v: 2, grp: [{ t: "lp" }] }).grp[0].fn, undefined,
   "6.17 op positie koppelen, maar nooit twee groepen van een ander type");
eq(mkpSamenvoegen({ v: 2, mat: [{ i: 1 }], log: [regel] }, { v: 2, d: "2026-09-18" }).log[0], regel,
   "6.18 levert de app geen logboek aan, dan blijft het bestaande staan");

console.log("▶ CATEGORIE 7: zegelnummers (hoofdstuk 9)");

eq(mkpZegels({ zeg: ["IQ-14718-004217", "IQ-14718-004218"] }), ["IQ-14718-004217", "IQ-14718-004218"], "7.1 lijst");
eq(mkpZegels({ zeg: "IQ-14718-004217" }), ["IQ-14718-004217"], "7.2 los nummer wordt gelezen zoals de lezer dat doet");
eq(mkpZegels({}), [], "7.3 geen zegels");

console.log("▶ CATEGORIE 8: omvang van de QR en de afkapvolgorde (hoofdstuk 6)");

// De meettabel uit hoofdstuk 6: URL-lengte → modules, op niveau M.
eq([517, 570, 670, 731, 858].map(qrModules), [89, 93, 101, 105, 113], "8.1 qrModules reproduceert de meettabel van hoofdstuk 6");
eq([QR_MODULES_GRENS, QR_NIVEAU], [105, "M"], "8.2 grens 105 modules op niveau M");
eq(qrModules(100000), Infinity, "8.3 groter dan versie 40 past nergens");

const klein = await mkpAfkappen(paspoort);
eq([klein.past, klein.melding, klein.paspoort], [true, "", paspoort], "8.4 een gewone kast blijft onaangeroerd");

// Deterministische ruis: handtekeningen en serienummers comprimeren niet.
let zaad = 0x9e3779b9;
const rnd = () => { zaad ^= zaad << 13; zaad ^= zaad >>> 17; zaad ^= zaad << 5; return (zaad >>> 0) / 4294967296; };
const ALFA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ruis = (n) => Array.from({ length: n }, () => ALFA[Math.floor(rnd() * 64)]).join("");
const logVol = Array.from({ length: 10 }, (_, i) => ({ d: `2026-0${(i % 9) + 1}-15`, b: `Bedrijf ${i}`, w: "werk aan de kast", sid: `k-${i}`, sig: ruis(86) }));

// A: het logboek inkorten volstaat — dan blijft de materiaallijst ongemoeid.
const pA = { v: 2, d: "2026-09-18", pc: "2691JJ", nr: "72", ha: { f: 3, a: 25 }, xyz: 123,
  mat: [{ i: 1, fab: "Hager", typ: "CDA440D", art: "CDA440D", sn: "A1", pd: "2024-11", xyz: 1 }], log: logVol };
const a = await mkpAfkappen(pA);
eq(a.past, true, `8.5 na afkappen past het (${a.modules} modules)`);
eq(a.weggelaten.logregels > 0, true, "8.6 eerst gaan er logboekregels af");
eq(a.paspoort.mat, pA.mat, "8.7 zolang het logboek volstaat, blijft de materiaallijst staan");
eq(a.paspoort.log.every((r, k) => JSON.stringify(r) === JSON.stringify(logVol[k])), true,
   "8.8 de nieuwste regels blijven, byte-voor-byte — nooit een ingekorte regel");
eq(a.paspoort.xyz, 123, "8.9 onbekende velden overleven het afkappen");
eq(/oudste logboekregel/.test(a.melding), true, "8.10 de gebruiker krijgt één regel over wat is weggelaten");

// B: het logboek volstaat niet — dan de volgorde 2, 3, 4 af.
const pB = { v: 2, d: "2026-09-18", pc: "2691JJ", nr: "72", ha: { f: 3, a: 25, xyz: "ha" }, xyz: 123,
  mat: Array.from({ length: 14 }, (_, i) => i % 2
    ? { i, fab: "Hager", typ: "MCN116", art: "MCN116", sn: ruis(10), pd: "2024-05", xyz: i }
    : { i, fab: "Onbekend", typ: "B16", sn: ruis(10), pd: "2023", xyz: i }),
  grp: Array.from({ length: 20 }, (_, i) => ({ t: "alg", rol: "af", f: 1, fn: [(i % 3) + 1], mat: i, n: `Groep ${i} ${ruis(40)}` })),
  log: logVol.slice(0, 3) };
const pBvoor = JSON.stringify(pB);
const b = await mkpAfkappen(pB);
eq(b.paspoort.log.length, 1, "8.11 het logboek is tot de nieuwste regel ingekort vóór er materiaal wegvalt");
eq(b.weggelaten.detailvelden, 7, "8.12 daarna sn en pd van de zeven toestellen zonder artikelnummer");
eq(b.paspoort.mat.length, 0, "8.13 daarna hele mat-regels — pas als dat op is volgen de omschrijvingen");
eq(b.weggelaten.omschrijvingen > 0, true, "8.14 als laatste worden omschrijvingen ingekort");
eq(b.paspoort.grp.every(g => g.n.length <= 24 && g.fn && g.t === "alg"), true, "8.15 alleen de omschrijving is ingekort, de rest van de groep niet");
eq([b.paspoort.xyz, b.paspoort.ha.xyz], [123, "ha"], "8.16 onbekende velden staan er nog");
eq(JSON.stringify(pB), pBvoor, "8.17 het aangeleverde paspoort zelf wordt niet gewijzigd");
eq(b.past, true, `8.18 en daarna past het (${b.modules} modules)`);

// C: nooit afkappen op grond van een onbekend veld.
const pC = { v: 2, d: "2026-09-18", xyz: ruis(3000) };
const c = await mkpAfkappen(pC);
eq([c.past, c.paspoort.xyz === pC.xyz], [false, true], "8.19 te groot door een onbekend veld: het veld blijft, de uitkomst zegt 'past niet'");
eq(/te dicht voor een sticker van 50 mm/.test(c.melding), true, "8.20 en de melding zegt dat ook");

console.log("▶ CATEGORIE 9: controleren — handtekening, erkenning, veldnotities");

// De echte demo: de QR op demo-qr-sticker-lezer.png (Installatiebedrijf Jansen,
// ondertekend, met erkenning, zegel en een aardlekautomaat uit de terugroepreeks).
const DEMO_FRAG = "ZVLbbtpAEP0Va17rrXbXF7CfiitQKCkqQU1IUFWt8WKMjW1sAyGIj-ov9Ms6YwKK1JfVXPbMOXN2T7AHX5oQgQ-SS5dxjwkBJpQLqnS56AWY5RVmQmKkVY5htyPcruNxzoW0bMftdLEVrrHz94_wPAezlQL_BEvwLRMwlM7ZhFRtqLjZSPAFb-s2x3pcleDPT9DggHKP4KrIMNwXOsIkPeC1zygShwk8UcBc_DJho_C-OJsXXFbecGr5jhLCfFdwAZnStK5Aeb5GSJy0k2vCZgrBSxVi_FgUVah1Fhn9TKdNVWCnOZbUCfqsdz9l8gezObM4NlTVtB61dpCBZOkXiXY60ma8LRXE8CCYA6Q6aZ1vSXfNjbQXBDeaqeQW-yrcj1gPSHgWkpGKHqOpdvoKiI450FavZDjaoWMs3vW_T5EQFquUQPSURaXytYaP795l3KVbWRG3lvz3I0jcMK8blWWqSXSooypZL41vKq81saLfcK9UVCqVGUIY6ZPxyQh1puomyePFSi9S-j8VioDkMmfrC7sj6O-8kdI5DCesrTDObSk6gJvWCSlZtyzsIojU1Amt9jNdukctR9E42S7yx1wl8fO2eVCjrYgncjjZddOntP86sFxUsB_tgl0YOFUvSMdF8PtubA0cHXve4fllNljNRrmTiZdZ74AOn_8B";
const demo = await mkpDecode(DEMO_FRAG);
const INDEX = JSON.parse(readFileSync(new URL("../veldnotities/index.json", import.meta.url)));
const FEED = JSON.parse(readFileSync(new URL("../veldnotities/demo-feed.json", import.meta.url)));
const sleutelJansen = INDEX.installateurs.find((i) => i.sleutel_id === "jansen-2026-01").publieke_sleutel;
const regelJ = demo.log[0];

eq(await mkpVerifieer(regelJ, "sig", sleutelJansen), "geldig", "9.1 de regel van Jansen klopt met zijn sleutel uit de index");
eq(await mkpVerifieer({ ...regelJ, w: regelJ.w + "." }, "sig", sleutelJansen), "ongeldig", "9.2 één teken gewijzigd breekt de handtekening");
eq(await mkpVerifieer({ ...regelJ, zeg: ["IQ-14718-004218"] }, "sig", sleutelJansen), "ongeldig", "9.3 een ander zegelnummer ook");
eq(await mkpVerifieer(regelJ, "sig", null), "onbekend", "9.4 zonder sleutel: ondertekend, niet te controleren");
eq(await mkpVerifieer({ d: "2026-01-01", b: "X", w: "y" }, "sig", sleutelJansen), "geen", "9.5 zonder handtekening: niet ondertekend");
eq(await mkpVerifieer(regelJ, "sig", INDEX.uitgevers[0].publieke_sleutel), "ongeldig", "9.6 de sleutel van een ander past niet");
// Volgorde van de sleutels doet er niet toe: canoniek is gesorteerd.
const omgedraaid = Object.fromEntries(Object.entries(regelJ).reverse());
eq(await mkpVerifieer(omgedraaid, "sig", sleutelJansen), "geldig", "9.7 andere veldvolgorde, zelfde handtekening");
eq(new TextDecoder().decode(mkpCanon({ b: 1, a: { d: 2, c: 3 } })), '{"a":{"c":3,"d":2},"b":1}', "9.8 canoniek: sleutels gesorteerd, ook genest");

eq(mkpErkenning(regelJ, INDEX), { uitgever: "installq", nummer: "14718", naam: "InstallQ", opzoek: "https://www.echteinstallateur.nl/" },
   "9.9 erkenning uiteengelegd, met de controleplek van de uitgever");
eq(mkpErkenning({ erk: "demo:14718" }, INDEX).opzoek, "https://meterkastpaspoort.nl/v.html?erk=14718", "9.10 {nummer} in de controleplek wordt ingevuld");
eq(mkpErkenning({ erk: "kiwa:123" }, INDEX), { uitgever: "kiwa", nummer: "123", naam: "kiwa", opzoek: null }, "9.11 onbekende uitgever: wel tonen, geen link verzinnen");
eq([mkpErkenning({ erk: "14718" }), mkpErkenning({ erk: "installq:" }), mkpErkenning({})], [null, null, null], "9.12 geen uitgever:nummer, geen erkenning");

const tr = mkpVeldnotities(demo, FEED);
eq(tr.map((t) => [t.notitie.id, t.treffer, t.toestel.i]), [["vbe-2026-003", "artikelnummer", 1]], "9.13 de terugroepactie treft de aardlekautomaat op artikelnummer, niet de ABB-automaat");
eq(mkpVeldnotities({ ...demo, mat: [{ i: 1, fab: "voorbeeld elektro", typ: "VBE-ALS-2P-40-30" }] }, FEED).map((t) => t.treffer), ["type"],
   "9.14 zonder artikelnummer: treffer op fabrikant + type (hoofdletters maken niet uit)");
eq(mkpVeldnotities(demo, { ...FEED, notities: FEED.notities.map((n) => ({ ...n, status: "ingetrokken" })) }), [], "9.15 een ingetrokken notitie telt niet");
eq(mkpVeldnotities({ ...demo, mat: undefined }, FEED), [], "9.16 zonder materiaallijst valt er niets te vergelijken");

// De sleutel van de beheerder staat vast in de code; een index die zichzelf
// een andere wortel geeft, bevestigt daarmee niets.
{
  const { subtle } = globalThis.crypto;
  const k = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pub = Buffer.from(await subtle.exportKey("raw", k.publicKey)).toString("base64url");
  const nep = { ...INDEX }; delete nep.handtekening; delete nep.wortel_publieke_sleutel;
  nep.handtekening = Buffer.from(await subtle.sign({ name: "Ed25519" }, k.privateKey, mkpCanon(nep))).toString("base64url");
  nep.wortel_publieke_sleutel = pub;
  eq(await mkpVerifieerIndex(nep, pub), "geldig", "9.17 (controle) de nep-index klopt met zijn eigen sleutel");
  eq((await mkpControleer(demo, { index: nep, feeds: [FEED] })).indexStatus, "ongeldig", "9.18 maar niet met de vastgepinde sleutel van de beheerder");
  eq(MKP_WORTEL_SLEUTEL.length, 43, "9.19 de vastgepinde sleutel is een Ed25519-sleutel (32 bytes)");
}

// De index zoals hij op 11-09-2026 is gepubliceerd (commit 5b6d305), correct
// ondertekend door de beheerder — zonder het wortelveld in de ondertekende bytes.
const INDEX_V02 = {"standaard":"meterkastpaspoort-veldnotitie-index/1.0","bijgewerkt":"2026-09-11","uitgevers":[{"naam":"Voorbeeld Elektro B.V.","domein":"voorbeeldelektro.nl","feed":"https://voorbeeldelektro.nl/.well-known/meterkastpaspoort-veldnotities.json","sleutel_id":"vbe-2026-01","publieke_sleutel":"hoUORPfRGO8WgzTPdt7r5P_EoAiymE5t95dHdFIJ1AE"}],"installateurs":[{"naam":"Installatiebedrijf Jansen","sleutel_id":"jansen-2026-01","publieke_sleutel":"3nGPr1uTfA_nInv3eF13-8mjxtf2R4WYF_6CxFXXa8Q"}],"handtekening":"0h5JTQJCOuAQKdEt3W-txmgegaAlnbAKe4u73pal_Fn9CMPs7aIU2LBqCzneW3D56GfhNWCXVBIVjSATS6-FDA","wortel_publieke_sleutel":"HpAJz53JhmwJJ8CNK01EmwdB-7O31ScoGdIy_ih9-sI"};
// Met de sleutel van toen, uitdrukkelijk: de vastgepinde sleutel mag daarna wisselen.
const WORTEL_11_09 = "HpAJz53JhmwJJ8CNK01EmwdB-7O31ScoGdIy_ih9-sI";
eq(await mkpVerifieerIndex(INDEX_V02, WORTEL_11_09), "geldig", "9.23 de index van 11-09 klopt met de sleutel van de beheerder van toen");
eq(await mkpVerifieerIndex({ ...INDEX_V02, bijgewerkt: "2026-09-12" }, WORTEL_11_09), "ongeldig", "9.24 één wijziging zonder nieuwe handtekening maakt hem ongeldig");
eq(await mkpVerifieerIndex({ ...INDEX_V02, wortel_publieke_sleutel: "x" }, WORTEL_11_09), "geldig", "9.25 het wortelveld zelf telt niet mee");

const c9 = await mkpControleer(demo, { index: INDEX, feeds: [FEED, FEED] });
eq(c9.log.map((l) => [l.handtekening, l.ondertekenaar, l.zegels]), [["geldig", "Installatiebedrijf Jansen", ["IQ-14718-004217"]]], "9.20 alles in één: handtekening, ondertekenaar, zegels");
eq(c9.notities.map((n) => [n.notitie.id, n.feedStatus, n.uitgever]), [["vbe-2026-003", "geldig", "Voorbeeld Elektro B.V."]], "9.21 feed ondertekend, en dezelfde feed twee keer telt één keer");
const zonder = await mkpControleer(demo);
eq([zonder.indexStatus, zonder.log[0].handtekening, zonder.notities.length], ["geen", "onbekend", 0], "9.22 offline zonder index: leesbaar, handtekening niet te controleren");

console.log("▶ CATEGORIE 10: materiaal van de app samenvoegen met dat van de bron");

// Kastscan schrijft sinds v0.3.2 zelf mat[] (fab, typ, pos). De bron kan meer
// weten — artikelnummer, productiecode — en die mag de nieuwe sticker niet kwijt.
{
  const bron = {
    v: 2, d: "2026-05-02", pc: "2801AB", nr: "12",
    grp: [{ t: "pv", rol: "voed", f: 1, fn: [1], mat: 1 }, { t: "lp", rol: "af", f: 3, fn: [1, 2, 3], mat: 2 }],
    mat: [
      { i: 1, s: "ala", fab: "Voorbeeld Elektro", typ: "VBE-ALS-2P-40-30", art: "1234567", pd: "@29-1524-07", pos: "R1-5", xyz: 7 },
      { i: 2, s: "aut", fab: "ABB", typ: "S203-C16", pos: "R1-9" },
      { i: 3, s: "als", fab: "Hager", typ: "CDA440D", pos: "R2-1", sn: "A12345" },
    ],
    log: [{ d: "2026-05-02", b: "Jansen", w: "groepenkast" }],
  };
  // De app ziet op R1-5 hetzelfde toestel (zonder art/pd — kan ze niet lezen),
  // op R1-9 een ÁNDER toestel, R2-1 ziet ze niet, en R1-1 is nieuw.
  const nieuw = {
    v: 2, d: "2026-09-19",
    grp: [{ t: "pv", rol: "voed", f: 1, fn: [1], mat: 2 }, { t: "lp", rol: "af", f: 3, fn: [1, 2, 3], mat: 3 }],
    mat: [
      { i: 1, s: "hs", fab: "Hager", typ: "SBN340", pos: "R1-1" },
      { i: 2, s: "ala", fab: "voorbeeld elektro", typ: "VBE-ALS-2P-40-30", pos: "R1-5" },
      { i: 3, s: "aut", fab: "Hager", typ: "MCN316", pos: "R1-9" },
    ],
    log: [{ d: "2026-09-19", b: "Kastscan", w: "kast gedocumenteerd" }],
  };
  const uit = mkpSamenvoegen(bron, nieuw);
  const op = (pos) => uit.mat.find((m) => m.pos === pos);
  eq([op("R1-5").art, op("R1-5").pd, op("R1-5").xyz], ["1234567", "@29-1524-07", 7], "10.1 zelfde toestel op dezelfde plaats: art, pd en onbekende velden blijven");
  eq(op("R1-5").fab, "voorbeeld elektro", "10.2 wat de app aanlevert wint (hoofdletters telden niet voor de koppeling)");
  eq([op("R1-9").typ, "art" in op("R1-9")], ["MCN316", false], "10.3 ander toestel op dezelfde plaats: de oude regel vervalt, niets geërfd");
  eq([op("R2-1") && op("R2-1").sn], ["A12345"], "10.4 een toestel dat de app niet ziet, blijft staan");
  eq(uit.mat.map((m) => m.i), [1, 2, 3, 4], "10.5 volgnummers opnieuw uitgedeeld, zonder gaten");
  eq(uit.grp.map((g) => uit.mat.find((m) => m.i === g.mat).pos), ["R1-5", "R1-9"], "10.6 grp[].mat wijst na omnummeren naar het juiste toestel");
  eq(uit.mat.length, 4, "10.7 geen dubbele regel voor R1-5 of R1-9");
  eq(mkpVeldnotities(uit, FEED).map((t) => t.treffer), ["artikelnummer"], "10.8 de terugroepactie treft na een nieuwe scan nog steeds op artikelnummer");

  // Groep uit de bron die de app niet aanlevert, met een verwijzing naar een
  // toestel dat vervalt: de verwijzing gaat weg in plaats van naar iets anders te wijzen.
  const u2 = mkpSamenvoegen(bron, { ...nieuw, grp: [nieuw.grp[0]] });
  eq(u2.grp.length, 1, "10.9 (controle) de app levert één groep");
  const zonderApp = mkpSamenvoegen(bron, { v: 2, d: "2026-09-19", grp: bron.grp });
  eq(zonderApp.mat, bron.mat, "10.10 zonder eigen materiaallijst van de app blijft die van de bron ongemoeid");
  const vervalt = mkpSamenvoegen({ ...bron, grp: [{ t: "aut", mat: 2 }] }, { v: 2, mat: [{ i: 1, s: "aut", fab: "Hager", typ: "MCN316", pos: "R1-9" }] });
  eq("mat" in vervalt.grp[0], false, "10.11 een verwijzing naar een vervangen toestel verdwijnt");
}

// Afkappen haalt een mat-regel weg: een groep mag er daarna niet meer naar wijzen.
{
  const veel = { v: 2, d: "2026-09-19",
    grp: Array.from({ length: 30 }, (_, k) => ({ t: "alg", rol: "af", f: 1, fn: [1 + (k % 3)], mat: k + 1 })),
    mat: Array.from({ length: 30 }, (_, k) => ({ i: k + 1, s: "aut", fab: "Hager", typ: "MCN" + ruis(8), pos: `R${1 + Math.floor(k / 12)}-${1 + (k % 12)}` })) };
  const a = await mkpAfkappen(veel);
  const bestaat = new Set(a.paspoort.mat.map((m) => m.i));
  eq([a.weggelaten.matregels > 0, a.paspoort.grp.every((g) => !("mat" in g) || bestaat.has(g.mat))], [true, true],
     "10.12 na afkappen wijst geen groep naar een weggelaten toestel");
}

console.log("\n═══════════════════════════════════════════════");
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
console.log("═══════════════════════════════════════════════");
if (failures.length) {
  console.log("\n⚠️  MISLUKTE TESTS:");
  failures.forEach(f => console.log("  " + f));
  process.exit(1);
}
console.log("\n✅ Het paspoortformaat doet wat de specificatie belooft");

