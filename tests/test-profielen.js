// ─────────────────────────────────────────────────────────────────────────────
// Open Meterkastpaspoort — de drie profielen en de maat van de sticker
// (voorstel v0.4, besluiten 17-11-2026: 4, 5, 8, 9 en 10).
// Voer uit met:  npm test
// ─────────────────────────────────────────────────────────────────────────────
import {
  MKP_PROFIELEN, MKP_PROFIEL_VELDEN, MKP_STREEF_TEKENS, mkpProfielVan, mkpProfiel, mkpGrootte,
  mkpAfkappen, mkpDecode, mkpEncode, mkpControleer, QR_MODULES_GRENS, MKP_VELDEN,
} from "../mkp.js";
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}
const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

console.log("▶ P: de profielen");
eq(MKP_PROFIELEN, ["kern", "inspectie", "volledig"], "P1 drie profielen, in volgorde (besluit 4)");
eq(MKP_VELDEN[""].filter((k) => mkpProfielVan(k) !== "kern"), ["mat", "mw"], "P2 alles wat de codec kent hoort in de kern, behalve mat[] en mw[] (besluit 23-11-2026)");
eq([mkpProfielVan("stl"), mkpProfielVan("mat"), mkpProfielVan("grp.mat"), mkpProfielVan("mw")], ["kern", "volledig", "volledig", "volledig"], "P2a stelsel op de sticker; materiaal en meetwaarden alleen in volledig");
eq([mkpProfielVan("vd"), mkpProfielVan("voed")], ["kern", "kern"], "P3 de verwijzing naar onderverdelers gaat mee in de kern (besluit 8)");
eq(mkpProfielVan("frq"), "kern", "P4 de datum van de volgende inspectie staat op de sticker (besluit 5)");
eq([mkpProfielVan("idc"), mkpProfielVan("con")], ["inspectie", "inspectie"], "P5 SCIOS-code en constateringen niet op de sticker (besluit 5)");
eq([mkpProfielVan("res"), mkpProfielVan("grond")], ["kern", "kern"], "P6 reservering en grondslag op de sticker (besluit Martin 25-11-2026, draait besluit 8 om)");
eq(mkpProfielVan("xyz"), null, "P7 een onbekend veld hoort bij geen profiel");
const alle = Object.values(MKP_PROFIEL_VELDEN).flat();
eq(alle.length, new Set(alle).size, "P8 geen veld in twee profielen tegelijk");

const vol = { v: 2, d: "2026-11-17", pc: "9999ZZ", nr: "1", frq: "2029-11", idc: "X-123", con: [{ c: "A1" }],
  stp: [{ d: "2026-11-17" }], res: [{ t: "wp" }], xyz: 1,
  log: [{ d: "2026-11-17", b: "Bedrijf", w: "inspectie", mm: [{ id: "T1" }] }, { d: "2025-01-01", b: "Oud", w: "x", mm: [{ id: "T0" }], sid: "k", sig: "AAAA" }] };
const voor = JSON.stringify(vol);
const k = mkpProfiel(vol, "kern");
eq(Object.keys(k.paspoort), ["v", "d", "pc", "nr", "frq", "res", "xyz", "log"], "P9 kern: inspectie en volledig eruit, de reservering en onbekend blijven staan");
eq(k.weggelaten.sort(), ["con", "idc", "log[].mm", "stp"], "P10 kern: zegt wat er niet op de sticker staat");
eq(["mm" in k.paspoort.log[0], "mm" in k.paspoort.log[1], k.nietIngekort], [false, true, ["log[1]"]],
   "P11 een ondertekende logregel wordt nooit ingekort (anders klopt de handtekening niet meer)");
eq(JSON.stringify(vol), voor, "P12 het origineel blijft ongewijzigd");
const ins = mkpProfiel(vol, "inspectie");
eq([("idc" in ins.paspoort), ("con" in ins.paspoort), ("res" in ins.paspoort), ins.paspoort.log[0].mm.length], [true, true, true, 1],
   "P13 inspectie: kern + inspectie, met de reservering (die zit in de kern)");
eq(mkpProfiel(vol, "volledig").paspoort, vol, "P14 volledig: alles");
let fout = ""; try { mkpProfiel(vol, "sticker"); } catch (e) { fout = e.message; }
eq(fout, "onbekend profiel: sticker", "P15 een onbekend profiel is een fout");

let zaad = 0x2545f491;
const rnd = () => { zaad ^= zaad << 13; zaad ^= zaad >>> 17; zaad ^= zaad << 5; return (zaad >>> 0) / 4294967296; };
const ALFA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ruis = (n) => Array.from({ length: n }, () => ALFA[Math.floor(rnd() * 64)]).join("");
console.log("▶ G: de maat van de sticker (besluit 9)");
eq(MKP_STREEF_TEKENS, 600, "G1 streefwaarde 600 tekens");
const jansen = fixture("demo-jansen");
const gj = await mkpGrootte(jansen.paspoort);
// Opnieuw coderen mag andere (even geldige) deflate-bytes geven dan het vastgelegde
// fragment; daarom de maat van wat hier gecodeerd wordt, niet van het fixture.
eq([gj.grens, gj.past, gj.modules <= QR_MODULES_GRENS, gj.tekens > 0], [QR_MODULES_GRENS, true, true, true], "G2 het demopaspoort: binnen de grens");
eq(gj.binnenStreef, gj.tekens <= 600, "G3 binnen de streefwaarde = hooguit 600 tekens");
const grens = fixture("grens-105");
const gg = await mkpGrootte(grens.paspoort);
eq([gg.modules, gg.past, gg.binnenStreef], [105, true, false], "G4 op de grens: past nog, maar boven de streefwaarde");

const G5 = await mkpGrootte({ v: 2, x: ruis(1500) });
eq([G5.past, G5.binnenStreef], [false, false], "G5 boven de grens: past niet");

console.log("▶ H: een volle sticker — nooit een handtekening of logregel weg (besluit 23-11-2026)");
// Drie ondertekende klussen op een kast: alles blijft staan, ook als het niet past.
const basis = grens.paspoort;
const drie = { ...basis, log: [0, 1, 2].map((i) => ({ d: `202${6 - i}-05-01`, b: `Bedrijf ${i}`, w: "werk aan de kast", sid: `k-${i}`, sig: ruis(86) })) };
const h = await mkpAfkappen(drie);
const kernDrie = mkpProfiel(drie, "kern").paspoort;
eq(h.paspoort.log, kernDrie.log, "H1 elke logregel blijft byte-voor-byte, mét handtekening");
eq(h.paspoort.grp, kernDrie.grp, "H2 de groepen blijven ongewijzigd, ook de omschrijvingen");
eq([h.past, h.geweigerd], [h.modules <= QR_MODULES_GRENS, h.modules > QR_MODULES_GRENS], "H3 past het niet, dan geweigerd — niet ingekort");
eq(h.geweigerd ? /geen QR gemaakt/.test(h.melding) : true, true, "H4 en de melding zegt het");
// Na het weghalen zou de controle "niet ondertekend" zeggen, nooit "komt niet overeen".
const c = await mkpControleer({ ...h.paspoort, log: h.paspoort.log.slice(1).map((r) => ({ ...r })) }, { index: { installateurs: [] } }).catch(() => null);
eq(c === null || JSON.stringify(c).includes("ongeldig") === false, true, "H6 een regel zonder handtekening leest als niet ondertekend, nooit als vervalst");
{
  // Alleen de indeling mag wijken.
  const p = { v: 3, d: "2026-11-23", pc: "1234AB", nr: "1", stl: "TT", grp: [{ t: "alg", rol: "af", f: 1, n: "Keuken" }],
    log: [{ d: "2026-11-23", b: "Eigen bedrijf", w: "oplevering", sid: "k", sig: ruis(86) }], ind: ruis(900), xyz: 1 };
  const u = await mkpAfkappen(p);
  eq([u.past, u.geweigerd, "ind" in u.paspoort, u.weggelaten.indeling], [true, false, false, true], "H7 te groot door de indeling: de indeling gaat eraf, de rest past");
  const { ind: _i, ...rest } = p;
  eq(u.paspoort, rest, "H8 en verder verandert er niets, ook het onbekende veld en de handtekening niet");
  eq(/kastindeling staat niet op de sticker/.test(u.melding), true, "H9 de melding noemt de indeling bij naam");
}
{
  // Een handtekening valt onder geen enkele omstandigheid weg.
  const veel = { ...basis, log: Array.from({ length: 45 }, (_, i) => ({ d: "2026-01-01", b: `B ${ruis(10)}`, w: ruis(20), sid: `k${i}`, sig: ruis(86) })) };
  const v = await mkpAfkappen(veel);
  eq([v.geweigerd, v.paspoort.log.length, v.paspoort.log.every((r) => "sig" in r)], [true, 45, true], "H10 45 ondertekende regels: geweigerd, alle regels en handtekeningen staan er nog");
}
{
  // De materiaallijst en de meetwaarden horen niet op de sticker.
  const p = { v: 3, d: "2026-11-23", grp: [{ t: "alg", rol: "af", mat: 1 }], mat: [{ i: 1, fab: "Hager", typ: "MCN116", art: "123" }], mw: [{ s: "zln", w: "0,42" }] };
  const u = await mkpAfkappen(p);
  eq([("mat" in u.paspoort), ("mw" in u.paspoort), ("mat" in u.paspoort.grp[0]), u.melding], [false, false, false, ""], "H11 mat[], grp[].mat en mw[] niet op de sticker, en dat is geen afkapmelding");
  eq(u.weggelaten.naarVolledig.sort(), ["grp[].mat", "mat", "mw"], "H12 wel genoemd als: staat in het volledige paspoort");
}

console.log("▶ A: het meetanker wijkt vóór de indeling (besluit 24-11-2026)");
{
  const ANKER = "261124;FL1664;32;41;250;18,23";
  const regel = { d: "2026-11-24", b: "Eigen bedrijf", w: "oplevering", ma: ANKER };
  // Zo groot dat het mét anker niet past, zonder anker wel (met de indeling).
  const basisInd = ruis(900);
  let ind = "", p = null, u = null, gevonden = false;
  for (let n = 400; n < 900; n += 1) {
    ind = basisInd.slice(0, n);
    p = { v: 3, d: "2026-11-24", pc: "1234AB", nr: "1", stl: "TN-C-S", grp: [{ t: "alg", rol: "af", f: 1, n: "Keuken" }], log: [{ ...regel }], ind };
    const zonder = await mkpGrootte({ ...p, log: [{ d: regel.d, b: regel.b, w: regel.w }] });
    const met = await mkpGrootte(p);
    if (!met.past && zonder.past) { gevonden = true; break; }
  }
  eq(gevonden, true, "A0 (controle) er is een sticker die met anker net niet past en zonder wel");
  u = await mkpAfkappen(p);
  eq([u.past, "ma" in u.paspoort.log[0], u.paspoort.ind === ind, u.weggelaten.meetanker, u.weggelaten.indeling], [true, false, true, 1, false], "A1 eerst gaat het anker eraf; de indeling blijft");
  eq(Object.keys(u.paspoort.log[0]), ["d", "b", "w"], "A2 de logregel zelf blijft staan");
  eq(/meetanker\) staan niet op de sticker/.test(u.melding), true, "A3 de melding noemt het meetanker bij naam");
  const getekend = { ...p, log: [{ ...regel, sid: "k", sig: ruis(86) }] };
  const g = await mkpAfkappen(getekend);
  eq([g.paspoort.log[0].ma, g.weggelaten.meetanker], [ANKER, 0], "A4 een ondertekende regel houdt zijn anker; dan wijkt de indeling of komt er geen QR");
  const klein = { v: 3, d: "2026-11-24", log: [{ ...regel }] };
  eq((await mkpAfkappen(klein)).paspoort.log[0].ma, ANKER, "A5 past het, dan blijft het anker staan");
  eq(MKP_VELDEN.log.includes("ma"), true, "A6 de codec kent log[].ma");
}

console.log("▶ S: het stelsel (besluit 23-11-2026)");
{
  const { mkpStelsel, MKP_STELSELS, MKP_MEETSOORTEN } = await import("../mkp.js");
  eq(MKP_STELSELS, ["TN-C-S", "TN-S", "TT", "IT"], "S1 vier stelsels");
  eq(["TN-C-S", "tncs", "TN_S", " tt ", "IT"].map(mkpStelsel), ["TN-C-S", "TN-C-S", "TN-S", "TT", "IT"], "S2 schrijfwijzen naar de vorm van de standaard");
  eq(["Anders", "", null, "TN"].map(mkpStelsel), [null, null, null, null], "S3 anders of onbekend: niet schrijven, geen gok");
  eq(["zln", "iso-fa", "rcd-t", "pe-ver", "pv-aard"].every((k) => k in MKP_MEETSOORTEN), true, "S4 de meetsoorten van 4.10");
}

console.log("▶ M: de materiaallijst — soortcodes en plaats (spec 4.5)");
{
  const { MKP_MAT_SOORTEN, mkpPlaatsLezen, mkpPlaatsTekst } = await import("../mkp.js");
  eq(Object.keys(MKP_MAT_SOORTEN), ["hs", "als", "ala", "aut", "kam", "tr", "ov"], "M1 de soortcodes van spec 4.5");
  eq(mkpPlaatsLezen("R1-5"), { verdeler: 1, rail: 1, positie: 5 }, "M2 R1-5");
  eq(mkpPlaatsLezen(" V2-R3-12 "), { verdeler: 2, rail: 3, positie: 12 }, "M3 met verdeler en spaties");
  eq([mkpPlaatsLezen(""), mkpPlaatsLezen(null), mkpPlaatsLezen("R1"), mkpPlaatsLezen("R0-1"), mkpPlaatsLezen("R1-0"), mkpPlaatsLezen("r1-5")], [null, null, null, null, null, null], "M4 onleesbaar of nul: null, geen gok");
  eq([mkpPlaatsTekst({ rail: 1, positie: 5 }), mkpPlaatsTekst({ verdeler: 2, rail: 1, positie: 5 }), mkpPlaatsTekst({ rail: 1, positie: 0 }), mkpPlaatsTekst({ rail: 1.5, positie: 2 })],
     ["R1-5", "V2-R1-5", null, null], "M5 schrijven, en geen verzonnen plaats");
  eq(mkpPlaatsLezen(mkpPlaatsTekst({ verdeler: 3, rail: 2, positie: 7 })), { verdeler: 3, rail: 2, positie: 7 }, "M6 heen en terug");
}

console.log("▶ R: de reservering wijkt nooit (besluit Martin 25-11-2026)");
{
  const { mkpAfkappen, mkpGrootte } = await import("../mkp.js");
  const res = [{ t: "wp", pos: "R1-9..11", mod: 3, f: 3, fn: [1, 2, 3], a: 16, kw: 8, n: "lege buis naar zolder" }, { t: "lp", pos: "R2-1..2", mod: 2, f: 1, fn: [2], a: 20, kw: 3.7 }];
  const grond = { d: "2026-11-25", ha: 25, kam: 40, gl: 0.6, rest: 9, door: "installq:12345" };
  const leeg = { v: 3, d: "2026-11-25", pc: "9999ZZ", nr: "1", grp: [{ t: "alg", n: "Keuken" }] };
  const kost = (await mkpGrootte({ ...leeg, res, grond })).tekens - (await mkpGrootte(leeg)).tekens;
  eq(kost > 0 && kost < 250, true, `R1 twee reserveringen met grondslag kosten ${kost} tekens in de QR`);
  // Een volle sticker: de indeling wijkt, de reservering blijft (en anders weigeren).
  const groot = { ...leeg, res, grond, ind: "A".repeat(600), grp: Array.from({ length: 20 }, (_, i) => ({ t: "alg", n: "groep nummer " + i })) };
  const a = await mkpAfkappen(groot);
  eq(["res" in a.paspoort, "grond" in a.paspoort], [true, true], "R2 bij een volle sticker blijven reservering en grondslag staan");
}

console.log(`\nRESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
for (const f of failures) console.log("  " + f);
process.exit(failed ? 1 : 0);
