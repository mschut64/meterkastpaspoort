// ─────────────────────────────────────────────────────────────────────────────
// Open Meterkastpaspoort — versie 0.4 in de payload (voorstel; besluiten 2, 5, 6
// van 17-11-2026): datamodel 3 met de indeling (ind) en de volgende inspectie (frq).
// Voer uit met:  npm test
// ─────────────────────────────────────────────────────────────────────────────
import {
  MKP_V04_DATAMODEL, mkpVolgendeInspectie, mkpIndeling, mkpZetV04, mkpZonderIndeling,
  mkpIndelingInpakken, mkpEncode, mkpDecode, mkpLees, mkpSamenvoegen, mkpOnbekendePaden,
  mkpProfiel, mkpAfkappen, mkpGrootte, mkpControleer, MKP_SPEC_VERSIE,
} from "../mkp.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}

const KAST = { st: "gemeten", mpr: 12, toestellen: [
  { soort: "hoofdschakelaar", breedte: 4, polen: "3P+N", In: 40 },
  { soort: "aardlek", breedte: 2, polen: "1P+N", idn: 30, lek: "A" },
  { soort: "automaat", breedte: 1, In: 16, kar: "B", groep: 1 },
  { soort: "automaat", breedte: 1, In: 20, kar: "C", groep: 2 },
  { soort: "railscheiding" },
  { soort: "aardlekautomaat", breedte: 2, In: 16, kar: "B", idn: 30, lek: "A", groep: 3 },
] };
const IND = mkpIndelingInpakken(KAST).tekst;
const BASIS = { v: 2, d: "2026-11-17", pc: "9999ZZ", nr: "1", ha: { f: 3, a: 25 },
  grp: [{ t: "alg", rol: "af", f: 1, fn: [1] }, { t: "kook", rol: "af", f: 3, fn: [1, 2, 3] }, { t: "alg", rol: "af", f: 1, fn: [2] }],
  log: [{ d: "2026-11-17", b: "Voorbeeld Installatie", w: "groepenkast vervangen" }] };

console.log("▶ Z: schrijven (mkpZetV04)");
const z = mkpZetV04(BASIS, { ind: IND, frq: "2029-11" });
eq([z.paspoort.v, z.paspoort.ind, z.paspoort.frq, z.weggelaten], [3, IND, "2029-11", []], "Z1 datamodel 3 met indeling en volgende inspectie");
eq(BASIS.v, 2, "Z2 het origineel blijft ongewijzigd");
const ontwerp = mkpIndelingInpakken({ ...KAST, st: "ontworpen" }).tekst;
const z2 = mkpZetV04(BASIS, { ind: ontwerp });
eq(["ind" in z2.paspoort, z2.weggelaten[0].veld, /gemeten/.test(z2.weggelaten[0].reden)], [false, "ind", true], "Z3 een ontworpen indeling komt niet op een sticker (v0.4 §5)");
eq(mkpZetV04(BASIS, { ind: "kapot!" }).weggelaten[0].veld, "ind", "Z4 een kapot blok gaat niet mee");
eq(mkpZetV04(BASIS, { frq: "2029-13" }).weggelaten.map((w) => w.veld), ["frq"], "Z5 frq moet JJJJ-MM zijn");
eq(["ind" in mkpZetV04(z.paspoort, {}).paspoort, mkpZetV04(z.paspoort, {}).paspoort.frq], [false, "2029-11"],
   "Z6 een oude indeling gaat eruit; de volgende inspectie blijft staan als er geen nieuwe datum is (een installateur kent hem niet)");
eq(mkpZetV04(z.paspoort, { frq: "2032-03" }).paspoort.frq, "2032-03", "Z6a een nieuwe datum vervangt de oude");
eq(mkpZetV04({ ...z.paspoort, frq: "rommel" }, {}).paspoort.frq, undefined, "Z6b een ongeldige oude frq gaat niet mee");
eq(MKP_SPEC_VERSIE, 2, "Z7 standaard schrijft de codec nog datamodel 2 (besluit 2)");

console.log("▶ L: lezen");
const frag = await mkpEncode(z.paspoort);
const l = await mkpLees(frag);
eq([l.datamodel, l.bekend, l.nieuwer, l.profiel, l.profielStatus, l.onbekend], [3, true, false, "kern", "kern", []], "L1 mkpLees kent datamodel 3, profiel kern");
eq(mkpOnbekendePaden(z.paspoort), [], "L2 ind en frq zijn bekende velden");
const gi = mkpIndeling(await mkpDecode(frag));
eq([gi.indeling.st, gi.indeling.toestellen.length, gi.indeling.toestellen[2]], ["gemeten", 6, KAST.toestellen[2]], "L3 de indeling komt uit de sticker terug");
eq(mkpVolgendeInspectie(z.paspoort), "2029-11", "L4 de volgende inspectie");
eq([mkpIndeling(BASIS), mkpVolgendeInspectie(BASIS), mkpVolgendeInspectie({ frq: "<b>" })], [null, null, null], "L5 zonder blok of met rommel: null");
eq(Object.keys(mkpIndeling({ ind: "AAAA" })), ["fout"], "L6 een kapot blok geeft een fout, geen uitzondering; de rest blijft leesbaar");

console.log("▶ H: hergebruik en afkappen");
const nieuw = { v: 2, d: "2026-12-01", grp: BASIS.grp, log: [{ d: "2026-12-01", b: "Ander bedrijf", w: "groep bij" }] };
const samen = mkpSamenvoegen(z.paspoort, nieuw);
eq([samen.v, "ind" in samen], [3, true], "H1 mkpSamenvoegen laat ind staan en v gaat niet omlaag — de schrijver moet het blok zelf vervangen of weghalen");
const schoon = mkpZonderIndeling(samen);
eq([schoon.v, "ind" in schoon, schoon.frq], [3, false, "2029-11"], "H2 mkpZonderIndeling haalt alleen de indeling weg");
eq(mkpProfiel(z.paspoort, "kern").weggelaten, [], "H3 ind en frq horen in de kern");
const a = await mkpAfkappen(z.paspoort);
eq([a.past, a.paspoort.ind], [true, IND], "H4 afkappen laat de indeling staan");
const g = await mkpGrootte(z.paspoort);
eq([g.past, g.binnenStreef], [true, true], `H5 een woning met indeling past ruim (${g.tekens} tekens, ${g.modules} modules)`);

console.log("▶ F: vast testpaspoort in datamodel 3");
const pad = new URL("./fixtures/v04-woning.json", import.meta.url);
if (!existsSync(pad)) writeFileSync(pad, JSON.stringify({ omschrijving: "Voorstel v0.4 (datamodel 3): woning met indeling (ind) en volgende inspectie (frq). Demogegevens, geen echt adres.", fragment: frag, paspoort: z.paspoort }, null, 2) + "\n");
const fx = JSON.parse(readFileSync(pad, "utf8"));
eq(await mkpDecode(fx.fragment), fx.paspoort, "F1 het vastgelegde fragment leest zoals vastgelegd");
eq(mkpIndeling(fx.paspoort).indeling.toestellen.length, 6, "F2 met zijn indeling");

console.log(`\nRESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
for (const f of failures) console.log("  " + f);
process.exit(failed ? 1 : 0);
