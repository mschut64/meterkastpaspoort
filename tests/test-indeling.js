// Toetst het indelingsblok (codec/indeling.js, voorstel v0.4 bijgesteld): heen en terug, de vastgelegde groottes, elke tabelwaarde, de grenzen, elke foutsoort, een onbekende blokversie en een gereserveerde soort.
//
// Voer uit met:  npm test

import * as M from "../mkp.js";
import { readFileSync } from "node:fs";

const {
  mkpIndelingInpakken: pak, mkpIndelingUitpakken: uit,
  MKP_INDELING_VERSIE, MKP_INDELING_BITS, MKP_INDELING_SOORTEN, MKP_INDELING_VELDEN,
  MKP_INDELING_POLEN, MKP_INDELING_STROMEN, MKP_INDELING_KARAKTERISTIEKEN,
  MKP_INDELING_AANSPREEKSTROMEN, MKP_INDELING_AARDLEKTYPEN, MKP_INDELING_STATUS,
  MKP_INDELING_WARMTEROUTE, MKP_INDELING_GROEP_MAX, MKP_INDELING_BREEDTE_MAX,
  MKP_INDELING_AANTAL_MAX, MKP_INDELING_MPR_MAX, MKP_INDELING_NAAM_MAX,
} = M;

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}
function fout(fn) { try { fn(); return null; } catch (e) { return e; } }
// Een fout die het veld noemt, en (als gegeven) de waarde in de melding.
function geeftFout(fn, veld, waarde, label) {
  const e = fout(fn);
  if (!e) { failed++; failures.push(`❌ ${label}\n     verwacht een fout, kreeg geen`); return; }
  const okVeld = veld === undefined || e.veld === veld;
  const okWaarde = waarde === undefined || String(e.message).includes(typeof waarde === "string" ? JSON.stringify(waarde) : String(waarde));
  eq(okVeld && okWaarde && String(e.message).startsWith("indeling: "), true, `${label} — ${e.message} [veld ${e.veld}]`);
}
// Heen en terug: wat erin gaat komt er exact zo uit (kop en toestellen).
function heenTerug(ind) {
  const { bytes, tekst } = pak(ind);
  const verwacht = { versie: 1, st: ind.st, wr: ind.wr ?? "onbekend", ...(ind.mpr ? { mpr: ind.mpr } : {}), toestellen: ind.toestellen };
  return { bytes, tekst, uitBytes: uit(bytes), uitTekst: uit(tekst), verwacht };
}

// Hand-gemaakte bytes, voor wat de schrijver zelf nooit maakt.
function bits(...paren) {
  const b = []; let acc = 0, n = 0;
  for (const [w, k] of paren) for (let i = k - 1; i >= 0; i--) { acc = (acc << 1) | ((w >> i) & 1); if (++n === 8) { b.push(acc); acc = 0; n = 0; } }
  if (n) b.push(acc << (8 - n));
  return Uint8Array.from(b);
}
const kop = ({ v = 1, st = 0, wr = 0, mpr = 0, n = 1, nm = 0, res = 0 } = {}) => [[v, 4], [st, 2], [wr, 2], [mpr, 8], [n, 10], [nm, 1], [res, 5]];

// ─── de voorbeelden ──────────────────────────────────────────────────────────
const aut = (In, groep, kar = "B", polen = "1P+N", breedte = 1) => ({ soort: "automaat", breedte, polen, In, kar, groep });
const al = (In = 40, idn = 30, lek = "A", polen = "1P+N", breedte = 2) => ({ soort: "aardlek", breedte, polen, In, idn, lek });
const sep = { soort: "railscheiding" };

// A — het voorbeeld uit v0.4 §4.6: 20 toestellen op 3 rails (dus 2 railscheidingen).
const A = { st: "gemeten", wr: "beproefd", mpr: 12, toestellen: [
  { soort: "hoofdschakelaar", breedte: 2, polen: "1P+N", In: 40 }, al(), aut(16, 1), aut(16, 2), aut(16, 3), aut(16, 4), al(), aut(16, 5),
  sep, aut(16, 6), aut(16, 7), aut(20, 8), al(), aut(16, 9), aut(16, 10), aut(16, 11),
  sep, al(40, 30, "B"), aut(16, 12, "C"), aut(16, 13), { soort: "beltrafo", breedte: 2 }, { soort: "leeg", breedte: 2 },
] };
// B — woning, 3 rails van 12 modules, 16 groepen en één eigen naam (zonder kamrails: die staan niet in de indeling).
let g = 0; const n = () => ++g;
const B = { st: "gemeten", wr: "beproefd", mpr: 12, toestellen: [
  { soort: "hoofdschakelaar", breedte: 2, polen: "1P+N", In: 40 },
  al(), aut(16, n()), aut(16, n()), aut(16, n()), aut(16, n()), al(), aut(16, n()), aut(16, n()),
  sep, aut(16, n()), aut(16, n()), aut(16, n()), aut(16, n()), al(), aut(16, n()), aut(20, n()), aut(16, n()), aut(16, n()), { soort: "leeg", breedte: 2 },
  sep, al(40, 30, "B"), aut(16, n(), "C"),
  { soort: "aardlekautomaat", breedte: 2, polen: "1P+N", In: 16, kar: "B", idn: 30, lek: "A", groep: n() },
  { soort: "beltrafo", breedte: 2 }, { soort: "schakeltoestel", breedte: 1 }, { soort: "kwh-meter", breedte: 2 },
  { soort: "overig", breedte: 1, naam: "Wifi-module" }, { soort: "leeg", breedte: 2 },
] };
// C — bedrijfsverdeler 3×80 A, 5 rails van 24, 8 aardlekken 3P+N, 40 groepen (zonder kamrails).
g = 0;
const Ct = [{ soort: "hoofdschakelaar", breedte: 4, polen: "3P+N", In: 80 }, { soort: "overspanning", breedte: 4, polen: "3P+N" },
  { soort: "kwh-meter", breedte: 4, polen: "3P+N" }, { soort: "schakeltoestel", breedte: 1 }, { soort: "schakeltoestel", breedte: 1 }];
{
  let mod = 14;
  const plaats = (t, br) => {
    if (mod + br > 24) { if (24 - mod) Ct.push({ soort: "leeg", breedte: 24 - mod }); Ct.push(sep); mod = 0; }
    Ct.push(t); mod += br;
  };
  for (let a = 0; a < 8; a++) {
    plaats(al(40, 30, a === 7 ? "B" : "A", "3P+N", 4), 4);
    for (let i = 0; i < 4; i++) plaats(aut(16, n()), 1);
    plaats(aut(20, n(), "C", "3P+N", 3), 3);
  }
}
const C = { st: "gemeten", wr: "afgeleid", mpr: 24, toestellen: Ct };

console.log("▶ INDELING 1: de tabellen");
eq(MKP_INDELING_VERSIE, 1, "T1.1 blokversie 1");
eq(Object.values(MKP_INDELING_BITS).length > 0 && ["versie", "st", "wr", "mpr", "aantal", "namen", "reserve"].reduce((s, k) => s + MKP_INDELING_BITS[k], 0), 32, "T1.2 de kop is 32 bits");
eq(MKP_INDELING_BITS.versie, 4, "T1.3 de versie staat in de eerste 4 bits");
eq([MKP_INDELING_BITS, MKP_INDELING_SOORTEN, MKP_INDELING_VELDEN, MKP_INDELING_POLEN, MKP_INDELING_STROMEN, MKP_INDELING_KARAKTERISTIEKEN,
  MKP_INDELING_AANSPREEKSTROMEN, MKP_INDELING_AARDLEKTYPEN, MKP_INDELING_STATUS, MKP_INDELING_WARMTEROUTE].every(Object.isFrozen)
  && Object.values(MKP_INDELING_VELDEN).every(Object.isFrozen), true, "T1.4 alle tabellen zijn bevroren");
eq(MKP_INDELING_SOORTEN.length, 2 ** MKP_INDELING_BITS.soort, "T1.5 soortentabel vult precies zijn bits");
for (const [t, b] of [[MKP_INDELING_POLEN, "polen"], [MKP_INDELING_STROMEN, "In"], [MKP_INDELING_KARAKTERISTIEKEN, "kar"], [MKP_INDELING_AANSPREEKSTROMEN, "idn"], [MKP_INDELING_AARDLEKTYPEN, "lek"]]) {
  eq(t.length, 2 ** MKP_INDELING_BITS[b], `T1.6 ${b}: tabel vult precies zijn bits`);
  eq(t[0], null, `T1.7 ${b}: code 0 is 'niet vastgelegd'`);
  const echt = t.filter((x) => x !== null);
  eq(new Set(echt).size, echt.length, `T1.8 ${b}: geen dubbele waarden`);
}
// De codes uit v0.4 §4.3 blijven dezelfde.
eq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15].map((c) => MKP_INDELING_SOORTEN[c]),
  ["leeg", "hoofdschakelaar", "automaat", "aardlek", "aardlekautomaat", "overspanning", "beltrafo", "schakeltoestel", "kwh-meter", "pv-scheider", "lastscheider", "overig", "railscheiding"],
  "T1.9 de codes van v0.4 zijn ongewijzigd");
eq([MKP_INDELING_SOORTEN[12], MKP_INDELING_SOORTEN[13]], ["smeltveiligheid", null], "T1.10 smeltveiligheid erbij; code 13 (was kamrail) gereserveerd");
eq(MKP_INDELING_SOORTEN.includes("kamrail") || "kamrail" in MKP_INDELING_VELDEN || "lengte" in MKP_INDELING_BITS, false, "T1.10b geen kamrail en geen lengteveld meer in de tabellen");
eq(MKP_INDELING_POLEN, [null, "1P", "1P+N", "3P", "3P+N", null, null, null], "T1.10c polen: geen 2P en 4P; codes 5–7 gereserveerd");
eq(MKP_INDELING_BITS.polen, 3, "T1.10d polen blijft 3 bits (vijf waarden plus niet vastgelegd)");
eq(MKP_INDELING_SOORTEN.filter(Boolean).every((s) => Array.isArray(MKP_INDELING_VELDEN[s])) && Array.isArray(MKP_INDELING_VELDEN.gereserveerd), true, "T1.11 elke soort heeft een veldenlijst");
// v0.4 §4.2 en de automaatmaten van de motor zitten er allebei in.
eq([2, 4, 6, 10, 13, 16, 20, 25, 32, 35, 40, 50, 63, 80, 100, 125].every((a) => MKP_INDELING_STROMEN.includes(a)), true, "T1.12 stromen dekken v0.4 en de motor (6–125 A)");
eq(MKP_INDELING_KARAKTERISTIEKEN.includes("gG") && MKP_INDELING_AANSPREEKSTROMEN.includes(10) && MKP_INDELING_AARDLEKTYPEN.includes("F"), true, "T1.13 gG, 10 mA en type F erbij");
eq([MKP_INDELING_GROEP_MAX, MKP_INDELING_BREEDTE_MAX, MKP_INDELING_AANTAL_MAX, MKP_INDELING_MPR_MAX, MKP_INDELING_NAAM_MAX],
  [127, 8, 1023, 255, 30], "T1.14 de grenzen");

console.log("▶ INDELING 2: de drie voorbeelden, heen en terug, met vastgelegde grootte");
for (const [naam, ind, bytes, tekens] of [["A v0.4-voorbeeld", A, 64, 86], ["B woning", B, 92, 123], ["C bedrijfsverdeler", C, 171, 228]]) {
  const r = heenTerug(ind);
  eq(r.uitBytes, r.verwacht, `V ${naam}: heen en terug via bytes`);
  eq(r.uitTekst, r.verwacht, `V ${naam}: heen en terug via tekst`);
  eq([r.bytes.length, r.tekst.length], [bytes, tekens], `V ${naam}: ${bytes} bytes, ${tekens} tekens base64url`);
}
eq([A.toestellen.length, B.toestellen.filter((t) => t.groep).length, C.toestellen.filter((t) => t.groep).length], [22, 16, 40], "V aantallen kloppen (A 20+2, B 16 groepen, C 40 groepen)");
eq(C.toestellen.filter((t) => t.soort === "railscheiding").length, 4, "V C staat op 5 rails");

console.log("▶ INDELING 3: elke tabelwaarde heen en terug");
const rond = (t, kopje = {}) => uit(pak({ st: "gemeten", ...kopje, toestellen: [t] }).tekst).toestellen[0];
const minimaal = (s) => (MKP_INDELING_VELDEN[s].includes("breedte") ? { soort: s, breedte: 1 } : { soort: s });
for (const s of MKP_INDELING_SOORTEN.filter(Boolean)) eq(rond(minimaal(s)), minimaal(s), `W soort ${s}`);
for (const p of MKP_INDELING_POLEN.filter(Boolean)) eq(rond({ soort: "automaat", breedte: 1, polen: p }).polen, p, `W polen ${p}`);
// 2P en 4P zijn schrijfwijzen: erin als 2P/4P, eruit altijd als 1P+N/3P+N, en byte voor byte gelijk aan de +N-vorm.
for (const [schrijf, terug] of [["2P", "1P+N"], ["4P", "3P+N"]]) {
  eq(rond({ soort: "aardlek", breedte: 2, polen: schrijf }).polen, terug, `W polen ${schrijf} komt terug als ${terug}`);
  const x = pak({ st: "gemeten", toestellen: [{ soort: "aardlek", breedte: 2, polen: schrijf, In: 40 }] });
  const y = pak({ st: "gemeten", toestellen: [{ soort: "aardlek", breedte: 2, polen: terug, In: 40 }] });
  eq(x.tekst, y.tekst, `W polen ${schrijf} geeft dezelfde bytes als ${terug}`);
}
geeftFout(() => pak({ st: "gemeten", toestellen: [{ soort: "automaat", breedte: 1, polen: "3P+N+PE" }] }), "polen", "3P+N+PE", "W polen 3P+N+PE blijft een fout");
geeftFout(() => pak({ st: "gemeten", toestellen: [{ soort: "automaat", breedte: 1, polen: "6P" }] }), "polen", "6P", "W polen 6P blijft een fout");
for (const code of [5, 6, 7]) geeftFout(() => uit(bits(...kop(), [2, 5], [0, 3], [code, 3], [0, 5], [0, 3], [0, 7])), "polen", code, `W polencode ${code} (was 2P/4P) is gereserveerd`);
for (const a of MKP_INDELING_STROMEN.filter((x) => x !== null)) eq(rond({ soort: "automaat", breedte: 1, In: a }).In, a, `W In ${a}`);
for (const k of MKP_INDELING_KARAKTERISTIEKEN.filter(Boolean)) eq(rond({ soort: "smeltveiligheid", breedte: 1, kar: k }).kar, k, `W kar ${k}`);
for (const i of MKP_INDELING_AANSPREEKSTROMEN.filter(Boolean)) eq(rond({ soort: "aardlek", breedte: 2, idn: i }).idn, i, `W idn ${i}`);
for (const l of MKP_INDELING_AARDLEKTYPEN.filter(Boolean)) eq(rond({ soort: "aardlek", breedte: 2, lek: l }).lek, l, `W lek ${l}`);
eq(rond({ soort: "aardlek", breedte: 2, selectief: true }), { soort: "aardlek", breedte: 2, selectief: true }, "W selectief");
for (const b of [1, 2, 3, 4, 5, 6, 7, 8]) eq(rond({ soort: "leeg", breedte: b }).breedte, b, `W breedte ${b}`);
for (const st of MKP_INDELING_STATUS.filter(Boolean)) eq(uit(pak({ st, toestellen: [] }).bytes).st, st, `W st ${st}`);
for (const wr of MKP_INDELING_WARMTEROUTE) eq(uit(pak({ st: "gemeten", wr, toestellen: [] }).bytes).wr, wr, `W wr ${wr}`);
// Niet vastgelegd komt niet terug, ook niet als null of selectief: false.
eq(rond({ soort: "aardlekautomaat", breedte: 1, polen: null, In: null, kar: null, idn: null, lek: null, selectief: false, groep: null }),
  { soort: "aardlekautomaat", breedte: 1 }, "W null en false zijn 'niet vastgelegd'");
eq(rond({ soort: "aardlekautomaat", breedte: 2, polen: "1P+N", In: 16, kar: "C", idn: 30, lek: "A", selectief: true, groep: 9 }),
  { soort: "aardlekautomaat", breedte: 2, polen: "1P+N", In: 16, kar: "C", idn: 30, lek: "A", selectief: true, groep: 9 }, "W aardlekautomaat met alle velden");
// Bits per soort: wat het voorstel belooft.
for (const [s, b] of [["railscheiding", 5], ["leeg", 8], ["hoofdschakelaar", 16], ["automaat", 26], ["aardlek", 23], ["aardlekautomaat", 33], ["beltrafo", 11]]) {
  const som = MKP_INDELING_BITS.soort + MKP_INDELING_VELDEN[s].reduce((x, v) => x + MKP_INDELING_BITS[v], 0);
  eq(som, b, `W ${s} kost ${b} bits`);
}

console.log("▶ INDELING 4: de grenzen");
{
  const leeg = pak({ st: "gemeten", toestellen: [] });
  eq([leeg.bytes.length, leeg.tekst], [4, "EAAAAA"], "G0 nul toestellen: alleen de kop, 4 bytes");
  eq(uit(leeg.tekst), { versie: 1, st: "gemeten", wr: "onbekend", toestellen: [] }, "G0 nul toestellen terug");
  eq(rond({ soort: "automaat", breedte: 1, groep: MKP_INDELING_GROEP_MAX }).groep, 127, "G1 hoogste groepsnummer 127");
  eq(rond({ soort: "aardlekautomaat", breedte: MKP_INDELING_BREEDTE_MAX }).breedte, 8, "G2 breedste module (8)");
  eq(uit(pak({ st: "gemeten", mpr: 255, toestellen: [] }).tekst).mpr, 255, "G4 mpr 255");
  const vol = { st: "gemeten", toestellen: Array.from({ length: MKP_INDELING_AANTAL_MAX }, () => sep) };
  const p = pak(vol);
  eq([p.bytes.length, uit(p.bytes).toestellen.length], [4 + Math.ceil((1023 * 5) / 8), 1023], "G5 1023 toestellen");
  const dertig = "é".repeat(15);   // 30 bytes UTF-8
  eq(rond({ soort: "overig", breedte: 1, naam: dertig }).naam, dertig, "G6 een naam van precies 30 bytes UTF-8");
  eq(rond({ soort: "overig", breedte: 1, naam: "" }), { soort: "overig", breedte: 1 }, "G7 een lege naam is geen naam");
  const tweeOverig = { st: "gemeten", toestellen: [{ soort: "overig", breedte: 1 }, { soort: "overig", breedte: 2, naam: "Schakelklok" }] };
  eq(uit(pak(tweeOverig).tekst).toestellen, tweeOverig.toestellen, "G8 namen gaan op volgorde naar de juiste 'overig'");
  eq(pak(tweeOverig).bytes.length, 4 + 3 + 1 + 1 + 11, "G9 kosten namenlijst: 1 byte per 'overig' + de naam");
}

console.log("▶ INDELING 5: fouten bij het inpakken");
const P = (t) => () => pak({ st: "gemeten", toestellen: [t] });
geeftFout(P({ soort: "zekering", breedte: 1 }), "soort", "zekering", "F1 onbekende soort");
geeftFout(P({ soort: "gereserveerd", breedte: 1 }), "soort", "gereserveerd", "F2 een schrijver schrijft geen gereserveerde soort");
geeftFout(P({ breedte: 1 }), "soort", undefined, "F3 soort ontbreekt");
geeftFout(P({ soort: "automaat" }), "breedte", undefined, "F4 breedte ontbreekt");
for (const b of [0, 9, 1.5, "2"]) geeftFout(P({ soort: "automaat", breedte: b }), "breedte", b, `F5 breedte ${JSON.stringify(b)}`);
geeftFout(P({ soort: "automaat", breedte: 1, polen: "3P+PE" }), "polen", "3P+PE", "F6 polen buiten de tabel");
geeftFout(P({ soort: "automaat", breedte: 1, In: 7 }), "In", 7, "F7 In 7 A wordt niet afgerond");
geeftFout(P({ soort: "automaat", breedte: 1, In: "16" }), "In", "16", "F8 In als tekst");
geeftFout(P({ soort: "automaat", breedte: 1, kar: "K" }), "kar", "K", "F9 karakteristiek K");
geeftFout(P({ soort: "aardlek", breedte: 2, idn: 25 }), "idn", 25, "F10 aanspreekstroom 25 mA");
geeftFout(P({ soort: "aardlek", breedte: 2, lek: "B+" }), "lek", "B+", "F11 aardlektype B+");
geeftFout(P({ soort: "aardlek", breedte: 2, selectief: "ja" }), "selectief", "ja", "F12 selectief geen boolean");
for (const gr of [0, 128, 1.5]) geeftFout(P({ soort: "automaat", breedte: 1, groep: gr }), "groep", gr, `F13 groep ${gr}`);
geeftFout(P({ soort: "kamrail", polen: "1P+N", In: 63, lengte: 4 }), "soort", undefined, "F14 kamrail wordt geweigerd");
geeftFout(P({ soort: "kamrail" }), "soort", undefined, "F14b kamrail zonder velden ook");
{
  const e = fout(P({ soort: "kamrail" }));
  eq([e.toestel, e.waarde, e.message.includes('"kam"'), e.message.includes("één keer per kast")], [0, "kamrail", true, true], "F14c de fout verwijst naar het veld per kast");
}
geeftFout(P({ soort: "overig", breedte: 1, naam: "x".repeat(31) }), "naam", undefined, "F15 naam van 31 bytes");
geeftFout(P({ soort: "overig", breedte: 1, naam: 5 }), "naam", 5, "F16 naam geen tekst");
geeftFout(P({ soort: "automaat", breedte: 1, idn: 30 }), "idn", 30, "F17 veld dat niet bij de soort hoort");
geeftFout(P({ soort: "automaat", breedte: 1, naam: "x" }), "naam", "x", "F18 naam alleen bij overig");
geeftFout(P({ soort: "automaat", breedte: 1, fase: "L1" }), "fase", "L1", "F19 onbekend veld");
geeftFout(P(null), "toestel", undefined, "F20 toestel geen object");
geeftFout(() => pak({ toestellen: [] }), "st", undefined, "F21 st ontbreekt: geen stille standaard");
geeftFout(() => pak({ st: "goedgekeurd", toestellen: [] }), "st", "goedgekeurd", "F22 st buiten de tabel");
geeftFout(() => pak({ st: "gemeten", wr: "geschat", toestellen: [] }), "wr", "geschat", "F23 wr buiten de tabel");
for (const m of [0, 256, 12.5]) geeftFout(() => pak({ st: "gemeten", mpr: m, toestellen: [] }), "mpr", m, `F24 mpr ${m}`);
geeftFout(() => pak({ st: "gemeten", toestellen: Array(1024).fill(sep) }), "toestellen", 1024, "F25 1024 toestellen");
geeftFout(() => pak({ st: "gemeten", toestellen: "x" }), "toestellen", undefined, "F26 toestellen geen lijst");
geeftFout(() => pak({ st: "gemeten", toestellen: [], ind: 1 }), "ind", 1, "F27 onbekend kopveld");
geeftFout(() => pak(null), "indeling", undefined, "F28 geen indeling");
{
  const e = fout(P({ soort: "automaat", breedte: 1, In: 7 }));
  eq([e.toestel, e.veld, e.waarde], [0, "In", 7], "F29 de fout draagt toestel, veld en waarde");
  const e2 = fout(() => pak({ st: "gemeten", toestellen: [sep, sep, { soort: "leeg", breedte: 12 }] }));
  eq([e2.toestel, String(e2.message).includes("toestel 3")], [2, true], "F30 de fout noemt welk toestel");
}

console.log("▶ INDELING 6: fouten bij het uitpakken — kapot of afgekapt, nooit half");
for (const [naam, ind] of [["A", A], ["B", B], ["C", C]]) {
  const { bytes, tekst } = pak(ind);
  geeftFout(() => uit(bytes.subarray(0, bytes.length - 1)), undefined, undefined, `K1 ${naam}: laatste byte weg`);
  geeftFout(() => uit(bytes.subarray(0, 3)), undefined, undefined, `K2 ${naam}: kop afgekapt`);
  geeftFout(() => uit(tekst.slice(0, -1)), undefined, undefined, `K3 ${naam}: laatste teken weg`);
  geeftFout(() => uit(Uint8Array.from([...bytes, 0])), "einde", undefined, `K4 ${naam}: een byte te veel`);
  // Elke afkapping, niet alleen de laatste byte.
  let stil = 0;
  for (let k = 0; k < bytes.length; k++) if (!fout(() => uit(bytes.subarray(0, k)))) stil++;
  eq(stil, 0, `K5 ${naam}: geen enkele afkapping geeft een resultaat`);
}
geeftFout(() => uit(""), "versie", undefined, "K6 lege tekst");
geeftFout(() => uit(new Uint8Array(0)), "versie", undefined, "K7 lege bytes");
geeftFout(() => uit(42), "invoer", undefined, "K8 invoer geen tekst of bytes");
geeftFout(() => uit([16, 0, 0, 0]), "invoer", undefined, "K9 een gewone array is geen invoer");
geeftFout(() => uit("EAAA+A"), "tekst", undefined, "K10 teken buiten base64url");
geeftFout(() => uit("EAAAA"), "tekst", undefined, "K11 onmogelijke lengte");
geeftFout(() => uit("EAAAAB"), "tekst", undefined, "K12 losse bits aan het eind van de tekst");
geeftFout(() => uit(bits(...kop({ v: 0, n: 0 }))), "versie", 0, "K13 blokversie 0");
geeftFout(() => uit(bits(...kop({ n: 0, res: 1 }))), "reserve", 1, "K14 gereserveerde kopbits niet nul");
geeftFout(() => uit(bits(...kop({ st: 3, n: 0 }))), "st", undefined, "K15 onbekende status");
geeftFout(() => uit(bits(...kop(), [15, 5], [1, 3])), "opvulling", undefined, "K16 opvulbits niet nul");
geeftFout(() => uit(bits(...kop(), [2, 5], [0, 3], [7, 3], [0, 5], [0, 3], [0, 7])), "polen", 7, "K17 gereserveerde code voor polen");
geeftFout(() => uit(bits(...kop(), [2, 5], [0, 3], [0, 3], [23, 5], [0, 3], [0, 7])), "In", 23, "K18 gereserveerde code voor In");
geeftFout(() => uit(bits(...kop(), [2, 5], [0, 3], [0, 3], [0, 5], [5, 3], [0, 7])), "kar", 5, "K19 gereserveerde code voor kar");
geeftFout(() => uit(bits(...kop(), [3, 5], [0, 3], [0, 3], [0, 5], [6, 3], [0, 3], [0, 1])), "idn", 6, "K20 gereserveerde code voor idn");
geeftFout(() => uit(bits(...kop(), [3, 5], [0, 3], [0, 3], [0, 5], [0, 3], [5, 3], [0, 1])), "lek", 5, "K21 gereserveerde code voor lek");
geeftFout(() => uit(bits(...kop({ nm: 1 }), [15, 5])), "namen", undefined, "K22 namen gemeld zonder 'overig'");
geeftFout(() => uit(Uint8Array.from([...bits(...kop({ nm: 1 }), [11, 5], [0, 3], [0, 3]), 31, ...new Uint8Array(31)])), "naam", 31, "K23 naam langer dan 30 bytes");
geeftFout(() => uit(Uint8Array.from([...bits(...kop({ nm: 1 }), [11, 5], [0, 3], [0, 3]), 2, 0xc3, 0x28])), "naam", undefined, "K24 naam geen geldige UTF-8");
geeftFout(() => uit(Uint8Array.from([...bits(...kop({ nm: 1 }), [11, 5], [0, 3], [0, 3]), 5, 65])), "naam", undefined, "K25 naam afgekapt");
geeftFout(() => uit(bits(...kop({ nm: 1 }), [11, 5], [0, 3], [0, 3])), "naam", undefined, "K26 namenlijst ontbreekt");
geeftFout(() => uit(bits(...kop({ n: 2 }), [15, 5])), undefined, undefined, "K27 minder toestellen dan de kop meldt");

console.log("▶ INDELING 7: een onbekende blokversie wordt overgeslagen, zonder fout");
for (const v of [2, 7, 15]) {
  eq(uit(bits(...kop({ v, n: 0 }))), { overgeslagen: true, versie: v }, `O1 versie ${v} (bytes)`);
}
{
  // Wat er na de versie staat doet er niet toe: een latere versie mag alles anders doen.
  const vreemd = Uint8Array.from([0x2f, 0xff, 0xff, 0x00, 0x13]);
  eq(uit(vreemd), { overgeslagen: true, versie: 2 }, "O2 latere versie met onbegrijpelijke inhoud");
  const tekst = pak(A).tekst;
  const later = "I" + tekst.slice(1);   // eerste 6 bits 001000 → versie 2
  eq(uit(later), { overgeslagen: true, versie: 2 }, "O3 latere versie als tekst");
  eq(uit(Uint8Array.from([0xf0])), { overgeslagen: true, versie: 15 }, "O4 alleen één byte met een latere versie");
}

console.log("▶ INDELING 8: een gereserveerde soort is te lezen (volle veldenset)");
for (const code of [13, 14, 16, 31]) {
  const b = bits(...kop(), [code, 5], [1, 3], [2, 3], [9, 5], [2, 3], [2, 3], [2, 3], [1, 1], [5, 7]);
  eq(uit(b).toestellen, [{ soort: "gereserveerd", code, breedte: 2, polen: "1P+N", In: 16, kar: "C", idn: 30, lek: "A", selectief: true, groep: 5 }], `R1 soort ${code}`);
}
{
  // Een gereserveerde soort tussen gewone toestellen verschuift niets.
  const b = bits(...kop({ n: 3 }), [2, 5], [0, 3], [2, 3], [9, 5], [1, 3], [1, 7], [20, 5], [0, 3], [0, 3], [0, 5], [0, 3], [0, 3], [0, 3], [0, 1], [0, 7], [15, 5]);
  eq(uit(b).toestellen, [{ soort: "automaat", breedte: 1, polen: "1P+N", In: 16, kar: "B", groep: 1 }, { soort: "gereserveerd", code: 20, breedte: 1 }, { soort: "railscheiding" }], "R2 erna gaat het lezen gewoon door");
}

console.log("▶ INDELING 9: de ingang");
{
  const oud = ["MKP_BASIS", "MKP_SPEC_VERSIE", "MKP_MAX_FRAGMENT", "MKP_MAX_UITGEPAKT", "mkpEncode", "mkpDecode", "mkpUrl", "eanValide", "mkpSamenvoegen",
    "QR_TEKENS_GRENS", "QR_MODULES_GRENS", "QR_NIVEAU", "qrModules", "mkpAfkappen", "MKP_INDEX_URL", "MKP_DEMO_FEED_URL", "MKP_WORTEL_SLEUTEL",
    "mkpZegels", "mkpCanon", "mkpVerifieer", "mkpErkenning", "mkpVeldnotities", "mkpVerifieerIndex", "mkpControleer", "MKP_DATAMODELLEN",
    "MKP_VELDEN", "mkpLees", "mkpOnbekendePaden", "MKP_REGISTERS", "mkpRegister", "mkpSamenvatting", "mkpVerdeelinrichting", "qrWaarschuwing"];
  eq(oud.filter((x) => !(x in M)), [], "E1 alle eerdere exportnamen bestaan nog");
  const lezer = readFileSync(new URL("../lezer.html", import.meta.url), "utf8");
  const imp = [...lezer.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\/mkp\.js['"]/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));
  eq(imp.length > 0 && imp.filter((x) => !(x in M)), [], "E2 wat lezer.html importeert bestaat");
  const nieuw = ["mkpIndelingInpakken", "mkpIndelingUitpakken", "MKP_INDELING_VERSIE", "MKP_INDELING_BITS", "MKP_INDELING_SOORTEN", "MKP_INDELING_VELDEN",
    "MKP_INDELING_POLEN", "MKP_INDELING_STROMEN", "MKP_INDELING_KARAKTERISTIEKEN", "MKP_INDELING_AANSPREEKSTROMEN", "MKP_INDELING_AARDLEKTYPEN",
    "MKP_INDELING_STATUS", "MKP_INDELING_WARMTEROUTE", "MKP_INDELING_GROEP_MAX", "MKP_INDELING_BREEDTE_MAX", "MKP_INDELING_AANTAL_MAX", "MKP_INDELING_MPR_MAX", "MKP_INDELING_NAAM_MAX"];
  eq(nieuw.filter((x) => !(x in M)), [], "E3 de nieuwe namen bestaan");
  // De profielen en de maat van de sticker (besluiten 17-11-2026), getest in test-profielen.js.
  const profielen = ["MKP_PROFIELEN", "MKP_PROFIEL_VELDEN", "MKP_STREEF_TEKENS", "mkpProfielVan", "mkpProfiel", "mkpGrootte"];
  eq(profielen.filter((x) => !(x in M)), [], "E3a de namen van de profielen bestaan");
  eq(Object.keys(M).length, oud.length + nieuw.length + profielen.length, "E4 er is niets anders bijgekomen of weggevallen");
}

console.log("\n═══════════════════════════════════════════════");
if (failures.length) { console.log(failures.join("\n")); }
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
if (failed) process.exit(1);
console.log("✅ Indeling klopt");
