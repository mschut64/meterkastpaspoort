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
} from "../mkp.js";

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

console.log("\n═══════════════════════════════════════════════");
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
console.log("═══════════════════════════════════════════════");
if (failures.length) {
  console.log("\n⚠️  MISLUKTE TESTS:");
  failures.forEach(f => console.log("  " + f));
  process.exit(1);
}
console.log("\n✅ Het paspoortformaat doet wat de specificatie belooft");

