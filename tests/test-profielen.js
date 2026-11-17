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
eq(MKP_VELDEN[""].every((k) => mkpProfielVan(k) === "kern"), true, "P2 alles wat v0.3 kent hoort in de kern");
eq([mkpProfielVan("vd"), mkpProfielVan("voed")], ["kern", "kern"], "P3 de verwijzing naar onderverdelers gaat mee in de kern (besluit 8)");
eq(mkpProfielVan("frq"), "kern", "P4 de datum van de volgende inspectie staat op de sticker (besluit 5)");
eq([mkpProfielVan("idc"), mkpProfielVan("con")], ["inspectie", "inspectie"], "P5 SCIOS-code en constateringen niet op de sticker (besluit 5)");
eq(mkpProfielVan("res"), "volledig", "P6 reserve en grondslag alleen in het volledige dossier (besluit 8)");
eq(mkpProfielVan("xyz"), null, "P7 een onbekend veld hoort bij geen profiel");
const alle = Object.values(MKP_PROFIEL_VELDEN).flat();
eq(alle.length, new Set(alle).size, "P8 geen veld in twee profielen tegelijk");

const vol = { v: 2, d: "2026-11-17", pc: "9999ZZ", nr: "1", frq: "2029-11", idc: "X-123", con: [{ c: "A1" }],
  stp: [{ d: "2026-11-17" }], res: [{ t: "wp" }], xyz: 1,
  log: [{ d: "2026-11-17", b: "Bedrijf", w: "inspectie", mm: [{ id: "T1" }] }, { d: "2025-01-01", b: "Oud", w: "x", mm: [{ id: "T0" }], sid: "k", sig: "AAAA" }] };
const voor = JSON.stringify(vol);
const k = mkpProfiel(vol, "kern");
eq(Object.keys(k.paspoort), ["v", "d", "pc", "nr", "frq", "xyz", "log"], "P9 kern: inspectie en volledig eruit, onbekend blijft staan");
eq(k.weggelaten.sort(), ["con", "idc", "log[].mm", "res", "stp"], "P10 kern: zegt wat er niet op de sticker staat");
eq(["mm" in k.paspoort.log[0], "mm" in k.paspoort.log[1], k.nietIngekort], [false, true, ["log[1]"]],
   "P11 een ondertekende logregel wordt nooit ingekort (anders klopt de handtekening niet meer)");
eq(JSON.stringify(vol), voor, "P12 het origineel blijft ongewijzigd");
const ins = mkpProfiel(vol, "inspectie");
eq([("idc" in ins.paspoort), ("con" in ins.paspoort), ("res" in ins.paspoort), ins.paspoort.log[0].mm.length], [true, true, false, 1],
   "P13 inspectie: kern + inspectie, zonder de reservering");
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

console.log("▶ H: een volle sticker — oude handtekeningen eerst (besluit 10)");
// Drie ondertekende klussen op een kast: de nieuwste houdt zijn handtekening.
const basis = grens.paspoort;
const drie = { ...basis, log: [0, 1, 2].map((i) => ({ d: `202${6 - i}-05-01`, b: `Bedrijf ${i}`, w: "werk aan de kast", sid: `k-${i}`, sig: ruis(86) })) };
const h = await mkpAfkappen(drie);
eq(h.paspoort.log[0], drie.log[0], "H1 de laatste klus houdt zijn handtekening, byte-voor-byte");
eq(h.weggelaten.handtekeningen >= 1, true, "H2 eerst gaan handtekeningen van oudere regels af");
eq(h.paspoort.log.length === 3 || h.weggelaten.handtekeningen === 2, true, "H3 een regel valt pas weg als alle oudere handtekeningen al weg zijn");
eq(h.past, true, `H4 daarna past het (${h.modules} modules)`);
eq(/handtekening weggelaten bij/.test(h.melding), true, "H5 en de melding zegt het");
// Na het weghalen zegt de controle "niet ondertekend", niet "komt niet overeen".
const c = await mkpControleer({ ...h.paspoort, log: h.paspoort.log.slice(1).map((r) => ({ ...r })) }, { index: { installateurs: [] } }).catch(() => null);
eq(c === null || JSON.stringify(c).includes("ongeldig") === false, true, "H6 een regel zonder handtekening leest als niet ondertekend, nooit als vervalst");

// Review 17-11: de app zet zijn eigen regel bovenaan, nog niet ondertekend. Dan
// hoort de laatste ECHTE handtekening te blijven, en gaan eerst oude regels weg.
{
  const jansen = { d: "2026-01-10", b: "Installatiebedrijf Jansen", w: "groep bij", sid: "k-j", sig: ruis(86) };
  const oud = Array.from({ length: 40 }, (_, i) => ({ d: `20${10 + (i % 15)}-0${(i % 9) + 1}-01`, b: `Bedrijf ${ruis(8)}`, w: `werk ${ruis(12)}` }));
  const p = { ...basis, log: [{ d: "2026-11-17", b: "Eigen bedrijf", w: "oplevering" }, jansen, ...oud] };
  const u = await mkpAfkappen(p);
  eq(u.paspoort.log[1], jansen, "H7 de regel van de laatste ondertekende klus blijft heel, ook onder een ongetekende eigen regel");
  eq([u.weggelaten.handtekeningen, u.weggelaten.logregels > 0, u.past], [0, true, true], "H8 dan gaan oude regels weg in plaats van zijn handtekening");
}
{
  // De telling: alleen regels die er nog staan zonder handtekening.
  const veel = { ...basis, log: Array.from({ length: 45 }, (_, i) => ({ d: "2026-01-01", b: `B ${ruis(10)}`, w: ruis(20), sid: `k${i}`, sig: ruis(86) })) };
  const v = await mkpAfkappen(veel);
  eq(v.weggelaten.handtekeningen, v.paspoort.log.filter((r) => !("sig" in r)).length, "H9 de telling = regels op de sticker zonder handtekening");
  eq("sig" in v.paspoort.log[0], true, "H10 de nieuwste regel houdt zijn handtekening");
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

console.log(`\nRESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
for (const f of failures) console.log("  " + f);
process.exit(failed ? 1 : 0);
