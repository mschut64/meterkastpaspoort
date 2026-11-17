// Toetst de tabel van uitgevers en registers (codec/registers.js) en mkpRegister: vorm, herkomst, en dat hij niet afwijkt van de ondertekende index waar beide iets zeggen.
//
// Voer uit met:  npm test

import { MKP_REGISTERS, mkpRegister, mkpErkenning } from "../mkp.js";
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}

const INDEX = JSON.parse(readFileSync(new URL("../veldnotities/index.json", import.meta.url)));
const VELDEN = ["id", "naam", "soort", "domein", "opzoek", "zoektOp", "register", "demo", "bron"];
const byId = (id) => MKP_REGISTERS.find((r) => r.id === id);

console.log("▶ REGISTERS 1: de vorm van de tabel");
eq(Array.isArray(MKP_REGISTERS), true, "R1.1 de tabel is een lijst");
eq(Object.isFrozen(MKP_REGISTERS) && MKP_REGISTERS.every(Object.isFrozen), true, "R1.2 de tabel en zijn regels zijn bevroren");
eq(MKP_REGISTERS.every((r) => JSON.stringify(Object.keys(r)) === JSON.stringify(VELDEN)), true, "R1.3 elke regel heeft precies de vaste velden, in vaste volgorde");
eq(new Set(MKP_REGISTERS.map((r) => r.id)).size, MKP_REGISTERS.length, "R1.4 geen id dubbel");
eq(MKP_REGISTERS.every((r) => /^[a-z0-9]+$/.test(r.id)), true, "R1.5 id's zijn kleine letters en cijfers (geen dubbele punt)");
eq(MKP_REGISTERS.every((r) => ["erkenning", "certificaat", "register"].includes(r.soort)), true, "R1.6 soort is erkenning, certificaat of register");
eq(MKP_REGISTERS.every((r) => r.opzoek === null || /^https:\/\//.test(r.opzoek)), true, "R1.7 een opzoekplek is https of null");
eq(MKP_REGISTERS.every((r) => [null, "nummer", "bedrijfsnaam of KVK"].includes(r.zoektOp)), true, "R1.8 zoektOp is een vaste waarde of null");
eq(MKP_REGISTERS.every((r) => r.register === null || byId(r.register)?.soort === "register"), true, "R1.9 een verwijzing naar een register wijst naar een regel van soort register");
eq(MKP_REGISTERS.every((r) => r.bron.length > 0 && r.bron.every((b) => ["index", "veldapp"].includes(b))), true, "R1.10 elke regel komt uit een bestaande lijst");
eq(MKP_REGISTERS.every((r) => r.zoektOp !== "nummer" || (r.opzoek || "").includes("{nummer}")), true, "R1.11 'zoekt op nummer' alleen met {nummer} in het adres");
eq(JSON.stringify(MKP_REGISTERS).match(/keuring|goedkeuring/i), null, "R1.12 geen 'keuring' of 'goedkeuring' in de tabel");

console.log("▶ REGISTERS 2: gelijk aan de ondertekende index waar beide iets zeggen");
for (const e of INDEX.erkenners) {
  const r = byId(e.id);
  eq(!!r, true, `R2.1 erkenner '${e.id}' uit de index staat in de tabel`);
  if (!r) continue;
  eq([r.naam, r.domein, r.opzoek], [e.naam, e.domein ?? null, e.opzoek ?? null], `R2.2 '${e.id}': naam, domein en opzoek gelijk aan de index`);
  eq(r.bron.includes("index"), true, `R2.3 '${e.id}': bron noemt de index`);
}
eq(MKP_REGISTERS.filter((r) => r.bron.includes("index")).map((r) => r.id).sort(),
  INDEX.erkenners.map((e) => e.id).sort(), "R2.4 precies de erkenners uit de index dragen bron 'index'");
eq(MKP_REGISTERS.filter((r) => r.bron.includes("veldapp")).map((r) => r.id).sort(),
  ["installq", "kiwa", "tlokb"], "R2.5 uit de veldapp: installq (ERK_UITGEVERS), kiwa (CO_UITGEVERS), tlokb (CO_REGISTER)");

console.log("▶ REGISTERS 3: mkpRegister");
{
  const r = mkpRegister("installq:14718");
  eq([r.uitgever, r.nummer, r.regel?.id, r.register?.id], ["installq", "14718", "installq", "installq"], "R3.1 erkenning met eigen opzoekplek");
  const k = mkpRegister("kiwa:K0213477");
  eq([k.uitgever, k.nummer, k.regel?.soort, k.register?.id, k.register?.zoektOp],
    ["kiwa", "K0213477", "certificaat", "tlokb", "bedrijfsnaam of KVK"], "R3.2 CO-certificaat: opzoeken in het register van een ander, op bedrijfsnaam of KVK");
  const d = mkpRegister("demo:IQ-00000");
  eq([d.regel?.demo, d.register?.zoektOp], [true, "nummer"], "R3.3 demo-uitgever zoekt op nummer");
  eq(mkpRegister("tlokb:123"), { uitgever: "tlokb", nummer: "123", regel: null, register: null }, "R3.4 een register is geen uitgever");
  eq(mkpRegister("acme:1"), { uitgever: "acme", nummer: "1", regel: null, register: null }, "R3.5 onbekende uitgever: regel null, geen gok");
  eq(mkpRegister("InstallQ:1").regel, null, "R3.6 exacte vergelijking van de uitgever, zoals mkpErkenning");
  eq(mkpRegister("a:b:c").nummer, "b:c", "R3.7 alleen de eerste dubbele punt scheidt");
  for (const fout of ["", ":1", "installq:", "installq", null, undefined, 42, {}])
    eq(mkpRegister(fout), null, `R3.8 ongeldige erk ${JSON.stringify(fout)} → null`);
  eq(mkpRegister("installq:1", []).regel, null, "R3.9 een andere tabel kan worden meegegeven");
  // Zelfde uiteenlegging als mkpErkenning, zodat beide lezers hetzelfde zien.
  for (const erk of ["installq:14718", "kiwa:K1", "a:b:c", "x:", ":y", ""]) {
    const m = mkpErkenning({ erk }, INDEX), g = mkpRegister(erk);
    eq(m ? [m.uitgever, m.nummer] : null, g ? [g.uitgever, g.nummer] : null, `R3.10 '${erk}': zelfde uitgever en nummer als mkpErkenning`);
  }
}

console.log("\n═══════════════════════════════════════════════");
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
console.log("═══════════════════════════════════════════════");
if (failures.length) {
  console.log("\n⚠️  MISLUKTE TESTS:");
  failures.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("\n✅ De tabel van uitgevers en registers klopt");
