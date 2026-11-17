// Toetst de versieherkenning (mkpLees, MKP_VELDEN): datamodel, profiel, onbekende velden, een hoger datamodel en kapotte invoer — en dat elk veld in de fixtures bekend is of bewust onbekend.
//
// Voer uit met:  npm test

import {
  mkpLees, mkpDecode, mkpEncode, MKP_BASIS, MKP_SPEC_VERSIE, MKP_MAX_FRAGMENT,
  MKP_DATAMODELLEN, MKP_VELDEN, mkpOnbekendePaden,
} from "../mkp.js";
import { readFileSync, readdirSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}
async function fout(fn) { try { await fn(); return null; } catch (e) { return String(e && e.message); } }

const map = new URL("./fixtures/", import.meta.url);
const fixture = (naam) => JSON.parse(readFileSync(new URL(naam + ".json", map), "utf8"));
const namen = readdirSync(map).filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, "")).sort();

console.log("▶ VERSIE 1: de vaste lijsten");
eq(MKP_DATAMODELLEN.includes(MKP_SPEC_VERSIE), true, "V1.1 het datamodel dat de codec schrijft, kent hij ook");
// Sinds 17-11-2026 kent de codec datamodel 3 (voorstel v0.4); hij schrijft
// standaard nog 2 — v0.4 schrijven gaat alleen via mkpZetV04 (besluit 2).
eq([Math.max(...MKP_DATAMODELLEN), MKP_SPEC_VERSIE], [3, 2], "V1.2 het hoogste bekende datamodel is 3 (v0.4); standaard wordt 2 geschreven");
eq(Object.isFrozen(MKP_VELDEN) && Object.values(MKP_VELDEN).every(Object.isFrozen), true, "V1.3 de veldenlijst is bevroren");
eq(Object.keys(MKP_VELDEN).filter((k) => k).every((k) => MKP_VELDEN[""].includes(k)), true, "V1.4 elk blok is een veld van het wortelobject");
// Elk veld in de lijst staat in de spec als <code>veld</code> (hoofdstuk 4).
{
  const spec = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const h4 = spec.slice(spec.indexOf("<h2>4. Datamodel"), spec.indexOf("<h2>5. Voorbeeld"));
  const ontbreekt = [];
  for (const [blok, velden] of Object.entries(MKP_VELDEN))
    for (const v of velden) if (!h4.includes(`<code>${v}</code>`)) ontbreekt.push(`${blok || "wortel"}.${v}`);
  eq(ontbreekt, [], "V1.5 elk bekend veld staat in hoofdstuk 4 van de spec");
}

console.log("▶ VERSIE 2: elk veld in de fixtures is bekend, of bewust onbekend");
// Alleen het fixture 'onbekende-velden' (en het verzonnen hogere datamodel) mag
// onbekende velden dragen, en precies deze.
const BEWUST_ONBEKEND = {
  "onbekende-velden": ["xyz", "ha.xyz", "mat[].xyz", "grp[].xyz"],
  "hoger-datamodel": ["toekomst"],
};
for (const naam of namen) {
  const paden = mkpOnbekendePaden(fixture(naam).paspoort);
  eq(paden.slice().sort(), (BEWUST_ONBEKEND[naam] || []).slice().sort(), `V2.1 ${naam}: onbekende velden zijn precies de bewust onbekende`);
}
eq(Object.keys(BEWUST_ONBEKEND).every((n) => namen.includes(n)), true, "V2.2 de fixtures met bewust onbekende velden bestaan");

console.log("▶ VERSIE 3: een gewoon paspoort (datamodel 2)");
for (const naam of namen.filter((n) => !BEWUST_ONBEKEND[n])) {
  const f = fixture(naam);
  const l = await mkpLees(f.fragment);
  // v04-woning is datamodel 3 (voorstel v0.4): bekend, profiel kern (tests/test-v04.js).
  const v3 = f.paspoort.v === 3;
  eq([l.datamodel, l.bekend, l.nieuwer, l.profiel, l.profielStatus, l.onbekend],
    v3 ? [3, true, false, "kern", "kern", []] : [2, true, false, null, "niet-van-toepassing", []],
    `V3.1 ${naam}: datamodel ${v3 ? "3, profiel kern" : "2, geen profiel"}, bekend, niets onbekend`);
  eq(l.paspoort, await mkpDecode(f.fragment), `V3.2 ${naam}: paspoort gelijk aan mkpDecode`);
}
{
  const f = fixture("demo-jansen");
  eq((await mkpLees(MKP_BASIS + f.fragment)).paspoort, f.paspoort, "V3.3 een volledig webadres wordt gelezen");
  eq((await mkpLees("https://yourwkb.nl/app#" + f.fragment)).paspoort, f.paspoort, "V3.4 ook na een doorverwijzing (fragment reist mee)");
  eq((await mkpLees("#" + f.fragment)).paspoort, f.paspoort, "V3.5 alleen het fragment met hekje");
  eq((await mkpLees("  " + f.fragment + "\n")).paspoort, f.paspoort, "V3.6 witruimte eromheen, zoals mkpDecode");
}

console.log("▶ VERSIE 4: onbekende velden (datamodel 2)");
{
  const f = fixture("onbekende-velden");
  const l = await mkpLees(f.fragment);
  eq([l.datamodel, l.bekend, l.nieuwer, l.profielStatus], [2, true, false, "niet-van-toepassing"], "V4.1 datamodel 2, bekend");
  eq(l.onbekend, ["xyz"], "V4.2 alleen het hoogste niveau in 'onbekend'");
  eq(l.paspoort, f.paspoort, "V4.3 onbekende velden blijven in het paspoort staan (niet weggehaald)");
}

console.log("▶ VERSIE 5: een verzonnen hoger datamodel");
{
  const f = fixture("hoger-datamodel");
  eq(await fout(() => mkpDecode(f.fragment)), null, "V5.1 mkpDecode weigert het niet");
  const l = await mkpLees(f.fragment);
  eq([l.datamodel, l.bekend, l.nieuwer, l.profiel, l.profielStatus], [9, false, true, null, "onbekend"], "V5.2 datamodel 9: onbekend, nieuwer, profiel onbekend (niet geraden)");
  eq(l.onbekend, ["toekomst"], "V5.3 het onbekende blok wordt genoemd");
  eq(l.paspoort, f.paspoort, "V5.4 zo goed mogelijk gelezen: alles staat er, ook het onbekende blok");
  const l1 = await mkpLees(await mkpEncode({ v: 1, ha: { f: 3, a: 25 } }));
  eq([l1.datamodel, l1.bekend, l1.nieuwer, l1.profielStatus], [1, true, false, "niet-van-toepassing"], "V5.5 datamodel 1 (v0.1) is bekend");
  const lx = await mkpLees(await mkpEncode({ v: 2.5 }));
  eq([lx.bekend, lx.nieuwer, lx.profielStatus], [false, false, "onbekend"], "V5.6 een datamodel dat niet in de lijst staat is niet bekend (2,5 is ook niet nieuwer dan 3)");
  const l0 = await mkpLees(await mkpEncode({ v: 0 }));
  eq([l0.bekend, l0.nieuwer], [false, false], "V5.7 een lager onbekend datamodel is niet 'nieuwer'");
}

console.log("▶ VERSIE 6: kapotte invoer geeft dezelfde fout als mkpDecode");
{
  const zonderV = await mkpEncode({ d: "2026-11-17" });
  const vTekst = await mkpEncode({ v: "2" });
  const geenJson = await (async () => {
    const cs = new CompressionStream("deflate-raw");
    const b = new Uint8Array(await new Response(new Blob([new TextEncoder().encode("{kapot")]).stream().pipeThrough(cs)).arrayBuffer());
    let s = ""; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  })();
  const bom = await mkpEncode({ v: 2, n: "x".repeat(70000) });
  const gevallen = {
    leeg: "", null: null, onzin: "!!!!", "geen deflate": "aGFsbG8", "te lang": "A".repeat(MKP_MAX_FRAGMENT + 1),
    "zonder v": zonderV, "v als tekst": vTekst, "geen JSON": geenJson, "te groot uitgepakt": bom,
  };
  for (const [naam, invoer] of Object.entries(gevallen)) {
    const a = await fout(() => mkpDecode(invoer)), b = await fout(() => mkpLees(invoer));
    eq([a !== null, b], [true, a], `V6.1 ${naam}: mkpLees gooit dezelfde fout als mkpDecode`);
  }
  eq(await fout(() => mkpLees(MKP_BASIS + vTekst)), await fout(() => mkpDecode(vTekst)), "V6.2 ook achter een webadres");
}

console.log("\n═══════════════════════════════════════════════");
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
console.log("═══════════════════════════════════════════════");
if (failures.length) {
  console.log("\n⚠️  MISLUKTE TESTS:");
  failures.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("\n✅ Versieherkenning klopt");
