// ─────────────────────────────────────────────────────────────────────────────
// De meterkastpaspoort-lezer (lezer/): het model, op vijf echte, geanonimiseerde
// paspoorten (tests/fixtures-lezer). Voer uit met:  node tests/test-lezer.js
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "node:fs";
import { mkpDecode } from "../mkp.js";
import { fragmentUit, kastModel, herkomst, leesAnker, bevTekst, groepenVerklaring, kastGegevens, reserveringen, leesPos } from "../lezer/model.js";
import { maakQr } from "../lezer/vendor/qrcode.min.js";
import { qrModules } from "../mkp.js";

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}
const map = new URL("./fixtures-lezer/", import.meta.url);
const fx = Object.fromEntries(readdirSync(map).filter((n) => n.endsWith(".json")).map((n) => [n.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(n, map), "utf8"))]));
const lees = async (naam) => mkpDecode(fx[naam].fragment);

console.log("▶ 0 · invoer");
eq(Object.keys(fx).sort(), ["afgekapt", "kast-17-groepen", "kast-3-groepen", "met-aardlekkoppeling", "met-reservering", "niet-gemeten", "v03-demo-jansen"], "0.1 zeven testpaspoorten");
eq([fragmentUit("https://meterkastpaspoort.nl/p#abc"), fragmentUit("https://yourwkb.nl/app#abc"), fragmentUit(" abc "), fragmentUit("")], ["abc", "abc", "abc", ""], "0.2 een link of een kaal fragment");

{ // Besluit Martin 25-11-2026: een scan met de telefooncamera (meterkastpaspoort.nl/p#…) komt in de lezer.
  const r = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).redirects;
  eq(r.filter((x) => x.source.startsWith("/p")).map((x) => x.destination), ["/lezer/", "/lezer/"], "0.3 /p gaat naar de lezer (het fragment reist mee)");
}
console.log("▶ 1 · kast met 17 groepen");
{
  const p = await lees("kast-17-groepen"), m = kastModel(p);
  const items = m.rails.flatMap((r) => r.items);
  eq([m.rails.length > 0, items.filter((i) => i.groep).length >= 17, m.groepen.length >= 17], [true, true, true], "1.1 rails, en elke groep aan een module");
  eq(items.every((it, k) => k === 0 || it.i === items[k - 1].i + 1), true, "1.2 de modules op volgorde");
  eq(m.rails.every((r) => r.items.every((it, k) => it.positie === (k ? r.items[k - 1].positie + r.items[k - 1].breedte : 0))), true, "1.3 de plaats volgt uit de breedtes");
  eq(m.status, "gebouwd", "1.4 de status uit st");
  eq(m.ontbreekt.some((t) => /gebouwd, nog niet gemeten/.test(t)), true, "1.5 en die staat er in woorden bij");
  const h = herkomst(p);
  eq([h[0].bedrijf, h[0].ondertekend, !!(h[0].meting && h[0].meting.tekst)], ["Installateur (voorbeeld)", false, true], "1.6 herkomst: wie, niet ondertekend, en de laatste meting");
}

console.log("▶ 2 · kast met 3 groepen");
{
  const m = kastModel(await lees("kast-3-groepen"));
  // Bevinding 25-11-2026: bij een met de hand ingedeelde kast schrijft de app geen
  // groepsnummers in de indeling (spec, open punt 8). De lezer zegt dat dan.
  eq([m.groepen.length, m.rails.length > 0, m.rails.flatMap((r) => r.items).filter((i) => i.groep).length], [3, true, 0], "2.1 drie groepen en een tekening, maar zonder koppeling");
  eq(m.ontbreekt.some((t) => /koppelt de modules niet aan de groepen/.test(t)), true, "2.2 en de lezer zegt dat de koppeling ontbreekt");
}

console.log("▶ 3 · niet gemeten");
{
  const p = await lees("niet-gemeten"), m = kastModel(p);
  eq([m.rails.length, m.groepen.length > 0], [0, true], "3.1 geen tekening, wel de groepen");
  eq(m.ontbreekt.some((t) => /geen indeling/.test(t)), true, "3.2 en de lezer zegt waarom er geen tekening is");
  eq(herkomst(p)[0].meting, null, "3.3 geen meetanker");
}

console.log("▶ 4 · afgekapt");
{
  const p = await lees("afgekapt"), m = kastModel(p), h = herkomst(p);
  eq([m.rails.length, m.groepen.length >= 17, h.length], [0, true, 3], "4.1 zonder indeling, met alle groepen en het hele logboek");
  eq(m.ontbreekt.some((t) => /niet op de sticker paste/.test(t)), true, "4.2 de lezer noemt dat de indeling niet paste als mogelijke reden");
  eq(h[0].meting, null, "4.3 het meetanker is eraf");
}

console.log("▶ 5 · v0.3 (datamodel 2)");
{
  const p = await lees("v03-demo-jansen"), m = kastModel(p), h = herkomst(p);
  eq([m.versie, m.rails.length], [2, 0], "5.1 versie 2, geen tekening");
  eq(m.ontbreekt.some((t) => /van vóór de indeling \(datamodel 2\)/.test(t)), true, "5.2 de lezer zegt dat de sticker van vóór de indeling is");
  eq([h[0].ondertekend, h[0].erkenning && h[0].erkenning.naam, h[0].zegels.length], [true, "InstallQ", 1], "5.3 handtekening, erkenning en zegel staan in de herkomst");
  eq(m.onbekend, [], "5.4 niets onbekends");
}

console.log("▶ 6 · kleine dingen");
eq([bevTekst({ kar: "B", In: 16 }), bevTekst({ In: 40, idn: 30, lek: "A" }), bevTekst({ kar: "gG", In: 35 })], ["B16", "40 A · 30 mA · type A", "gG 35"], "6.1 de beveiliging in een paar tekens");
eq(leesAnker("261124;FL1664;32;41;250;18,23").tekst, "Z L-N 0,32 Ω · Z L-PE 0,41 Ω · isolatie 250 MΩ · ΔT 18/23 ms", "6.2 het meetanker in woorden");
eq(leesAnker("onzin"), null, "6.3 onleesbaar anker: null");
eq(kastModel({ v: 3, ind: 42 }).ontbreekt.some((t) => /niet leesbaar/.test(t)), true, "6.4 een kapotte indeling: de rest blijft leesbaar");
eq(kastModel({ v: 3, xyz: 1, grp: [] }).onbekend, ["xyz"], "6.5 onbekende velden worden genoemd, niet getoond");

console.log("▶ 7 · de lezer laadt niets uit een app");
const MAG = ["../mkp.js", "./model.js", "./vendor/qrcode.min.js", "./verklaring.js"];
for (const f of ["lezer/lezer.js", "lezer/model.js", "lezer/verklaring.js"]) {
  const s = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const imports = [...s.matchAll(/^import .* from "([^"]+)"/gm), ...s.matchAll(/import\("([^"]+)"\)/g)].map((x) => x[1]);
  eq(imports.every((i) => MAG.includes(i)), true, `7.1 ${f} importeert alleen de codec, het model en de eigen delen`);
  eq(/innerHTML/.test(s), false, `7.2 ${f} zet niets als HTML in de pagina`);
}
const html = readFileSync(new URL("../lezer/index.html", import.meta.url), "utf8");
eq(/<script(?![^>]*src="\/lezer\/lezer\.js")[^>]*src=/.test(html), false, "7.3 de pagina laadt geen ander script dan de lezer");
eq(/user-scalable=no|maximum-scale/.test(html), false, "7.4 inzoomen blijft mogelijk");

console.log("▶ 8 · de groepenverklaring");
{
  const m = kastModel(await lees("kast-17-groepen")), v = groepenVerklaring(m);
  eq([v.regels.length, v.regels.every((r) => r.stroom === "B16"), v.aardlekken.map((a) => a.letter)], [17, true, ["A", "B", "C", "D"]], "8.1 17 regels met hun beveiliging, en de aardlekken A–D");
  // De vier aardlekken staan naast elkaar met alle automaten erachter: uit de plaats
  // afleiden zou overal "D" geven. Dus niets afleiden.
  eq(v.regels.every((r) => r.aardlek === ""), true, "8.2 de aardlek wordt nooit uit de plaats afgeleid");
  const v3 = groepenVerklaring(kastModel(await lees("kast-3-groepen")));
  eq([v3.regels.length, v3.gekoppeld, v3.regels.every((r) => r.stroom === "")], [3, false, true], "8.3 zonder koppeling: de groepen, zonder beveiliging");
  const ala = { rails: [{ nr: 1, breedte: 2, items: [{ i: 0, soort: "aardlekautomaat", breedte: 2, positie: 0, groep: 1, bev: "B16 · 30 mA · type A" }] }], groepen: [{ nr: 1, naam: "Laadpaal", type: "laadpunt", fase: "" }] };
  eq(groepenVerklaring(ala).regels[0].aardlek, "eigen (aardlekautomaat, 30 mA type A)", "8.4 een aardlekautomaat is zijn eigen aardlek");
  const bron = readFileSync(new URL("../lezer/verklaring.js", import.meta.url), "utf8");
  eq([/Opgesteld uit het meterkastpaspoort van \$\{datum\}\. Controleer of dit klopt met de kast\./.test(bron), /pdf-?lib|jspdf/i.test(bron)], [true, false], "8.5 de controlezin staat er vast in, en er zit geen pdf-bibliotheek in");
  const q = maakQr(`https://meterkastpaspoort.nl/p#${fx["kast-17-groepen"].fragment}`, "M");
  eq(q.modules.size, qrModules(`https://meterkastpaspoort.nl/p#${fx["kast-17-groepen"].fragment}`.length), "8.6 de QR op het vel is even groot als die op de sticker");
}

console.log("▶ 11 · achter welke aardlek (blokversie 2)");
{
  const m = kastModel(await lees("met-aardlekkoppeling")), v = groepenVerklaring(m);
  eq(v.regels.map((r) => r.aardlek).join(""), "AAAAABBBBCCCCDDDD", "11.1 de kolom Aardlek komt van de sticker");
  eq(v.metAardlek, true, "11.2 voor elke groep in de tekening bekend");
  eq(m.rails.flatMap((r) => r.items).find((it) => it.groep === 6).achter, "B", "11.3 de module weet achter welke aardlek hij hangt");
  eq(groepenVerklaring(kastModel(await lees("kast-17-groepen"))).metAardlek, false, "11.4 zonder koppeling op de sticker: niet bekend (en dus niet afgeleid)");
}

console.log("▶ 12 · de gegevens van de kast (uitklapblok)");
{
  const p = await lees("kast-17-groepen"), g = kastGegevens(p, kastModel(p));
  const r = Object.fromEntries(g.rijen);
  eq([r["Adres"], r["Bouwjaar kast"], r["Stelsel"], r["Hoofdaansluiting"], r["Kam / ontwerpstroom"]], ["9999ZZ 1", "2026", "TT", "3-fase × 25 A", "10 mm² · max 40 A"], "12.1 adres, bouwjaar, stelsel, aansluiting en kam");
  eq(g.samenvatting, "3 × 25 A · TT · bouwjaar 2026", "12.2 de kop van het blok");
  eq(g.rijen.every(([, w]) => w), true, "12.3 geen lege regels");
  const lb = kastGegevens({ lb: { aan: true, typ: "dyn", max: 25, reg: "evcc" }, chk: { r: "oranje", d: "2026-03-01" } }, kastModel({ v: 2 }));
  eq([lb.lb.tekst, lb.chk], ["Dynamisch · grens 25 A · regisseur: evcc", { r: "oranje", d: "2026-03-01" }], "12.4 load balancing en de laatste belastingcheck");
  eq(kastGegevens({ ean: "<script>" }, kastModel({ v: 2 })).rijen.find(([k]) => k === "EAN aansluiting")[1], "<script>", "12.5 tekst blijft tekst (de lezer zet hem met textContent)");
}

console.log("▶ 15 · voorbereid op (spec 4.11)");
{
  const p = await lees("met-reservering"), rv = reserveringen(p);
  eq(rv.lijst.map((r) => [r.naam, r.tekst, r.toelichting]), [
    ["Laadpaal", "rail 1, module 8 t/m 9 · 2 modules · fase 2 · 20 A · 3,7 kW", "Lege buis naar de oprit aanwezig"],
    ["Warmtepomp", "rail 1, module 10 t/m 12 · 3 modules · 3-fase · 16 A", ""],
  ], "15.1 per reservering waarvoor, waar, fasen en stroom, in woorden");
  eq(rv.grond, "Gebaseerd op de berekening van 2026-11-25: hoofdaansluiting 25 A, kam 40 A, gelijktijdigheid 0,6. Toen bleef 9 A over op de zwaarst belaste fase. Berekend door installq:12345.", "15.2 de grondslag in woorden");
  eq([leesPos("R2-5"), leesPos("V1R3-2..4"), leesPos("onzin"), leesPos("R1-0")], [{ rail: 2, van: 5, tot: 5 }, { rail: 3, van: 2, tot: 4 }, null, null], "15.3 de plaats lezen");
  eq(reserveringen(await lees("kast-17-groepen")), { lijst: [], grond: "" }, "15.4 zonder reservering: niets");
  eq(/oordeel|voldoet|past niet|afgekeurd/i.test(JSON.stringify(rv)), false, "15.5 signaal, geen oordeel");
  eq(kastModel(p).onbekend, [], "15.6 res en grond zijn bekende velden");
}

console.log("▶ 16 · de warmtehuishouding in de grondslag (spec 4.11, pb/pr)");
{
  const p = await lees("met-reservering");
  const metWarmte = (g) => reserveringen({ ...p, grond: { ...p.grond, ...g } }).grond;
  // ⚓ Het punt van deze velden: `rest` zegt hoeveel ampère er over is, en dat is
  // de halve vraag. Een laadpunt of thuisbatterij is continu belast en past
  // daarom lang niet altijd in de warmte, ook niet als er ampère over is.
  eq(/Voor de warmte bleef 4 W over van de 11 W die deze kast kwijt kan — een indicatie, geen temperatuurverificatie\./.test(metWarmte({ pb: 11, pr: 4 })), true, "16.1 budget en ruimte in woorden, met de indicatie erbij");
  eq(/geen ruimte meer.*3 W boven wat deze kast kwijt kan \(11 W\)/.test(metWarmte({ pb: 11, pr: -3 })), true, "16.2 ⚓ een negatieve ruimte leest als 'erboven', niet als 'niets over'");
  eq(/Voor de warmte bleef 4 W over —/.test(metWarmte({ pr: 4 })), true, "16.3 alleen de ruimte: ook bruikbaar");
  eq(/Deze kast kan 11 W aan warmte kwijt/.test(metWarmte({ pb: 11 })), true, "16.4 alleen het budget: ook bruikbaar");
  eq(reserveringen(p).grond.includes("Voor de warmte"), false, "16.5 zonder pb en pr zegt de lezer er niets over");
  eq(kastModel({ ...p, grond: { ...p.grond, pb: 11, pr: 4 } }).onbekend, [], "16.6 pb en pr zijn bekende velden");
  // De volgorde: eerst de ampère, dan de warmte, dan wie het deed.
  const vol = metWarmte({ pb: 11, pr: 4 });
  eq(vol.indexOf("A over op de zwaarst") < vol.indexOf("Voor de warmte") && vol.indexOf("Voor de warmte") < vol.indexOf("Berekend door"), true, "16.7 de warmte staat tussen de elektrische ruimte en de ondertekenaar");
}

console.log("\n" + "═".repeat(47));
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
console.log("═".repeat(47));
if (failures.length) { console.log("\n" + failures.join("\n")); process.exit(1); }
