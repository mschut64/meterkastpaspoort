// ─────────────────────────────────────────────────────────────────────────────
// Open Meterkastpaspoort — vaste testpaspoorten (tests/fixtures/*.json)
//
// Elk fixture is een paspoort met zijn gecodeerde fragment en wat de
// referentie-implementatie er op 17-11-2026 (v0.3.4) over zei. Dit is het
// vangnet bij het opknippen van mkp.js en bij werk aan versie 0.4: het
// FRAGMENT is vastgelegd, dus een lezer die morgen anders leest dan vandaag
// valt hier om — ook als coderen en decoderen samen nog netjes rondgaan.
//
// Alleen demogegevens: het adres en de ondertekende regel van het
// demopaspoort (Installatiebedrijf Jansen), geen echte personen of adressen.
//
// Het fragment zelf wordt NIET opnieuw byte-voor-byte vergeleken na coderen:
// deflate mag per platform andere (even geldige) bytes geven. Wat vast moet
// liggen is wat een lezer uit een bestaande sticker haalt.
//
// Voer uit met:  npm test
// ─────────────────────────────────────────────────────────────────────────────

import {
  mkpDecode, mkpEncode, mkpUrl, MKP_BASIS, qrModules, QR_MODULES_GRENS,
  mkpControleer, mkpVerdeelinrichting, mkpSamenvatting, mkpAfkappen,
} from "../mkp.js";
import { readFileSync, readdirSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; failures.push(`❌ ${label}\n     verwacht: ${e}\n     kreeg:    ${a}`); }
}

const map = new URL("./fixtures/", import.meta.url);
const INDEX = JSON.parse(readFileSync(new URL("../veldnotities/index.json", import.meta.url)));
const FEED = JSON.parse(readFileSync(new URL("../veldnotities/demo-feed.json", import.meta.url)));
const namen = readdirSync(map).filter((n) => n.endsWith(".json")).sort();

console.log(`▶ VASTE TESTPASPOORTEN (${namen.length})`);
eq(namen.length >= 5, true, "0.1 de fixtures zijn er");

for (const bestand of namen) {
  const naam = bestand.replace(/\.json$/, "");
  const f = JSON.parse(readFileSync(new URL(bestand, map), "utf8"));
  const v = f.verwacht;

  // 1. Het vastgelegde fragment geeft exact het vastgelegde object.
  const gelezen = await mkpDecode(f.fragment);
  eq(gelezen, f.paspoort, `${naam}: het fragment decodeert tot exact het paspoort`);

  // 2. Opnieuw coderen en decoderen geeft hetzelfde object.
  eq(await mkpDecode(await mkpEncode(f.paspoort)), f.paspoort, `${naam}: opnieuw coderen en decoderen geeft hetzelfde object`);
  eq((await mkpUrl(f.paspoort)).startsWith(MKP_BASIS), true, `${naam}: de URL begint met de basis`);

  // 3. De omvang van de sticker zoals hij nu is.
  eq(qrModules((MKP_BASIS + f.fragment).length), v.modules, `${naam}: ${v.modules} modules`);

  // 4. Handtekening, erkenning, zegels en veldnotities: dezelfde uitkomst als nu.
  const c = await mkpControleer(gelezen, { index: INDEX, feeds: [FEED] });
  eq({
    indexStatus: c.indexStatus,
    log: c.log.map((l) => ({ handtekening: l.handtekening, ondertekenaar: l.ondertekenaar, erkenning: l.erkenning, zegels: l.zegels })),
    notities: c.notities.map((n) => ({ id: n.notitie.id, treffer: n.treffer, toestel: n.toestel.i, feedStatus: n.feedStatus })),
  }, v.controle, `${naam}: controle (handtekening, erkenning, zegels, veldnotities) ongewijzigd`);

  // 5. Wat een lezer erover zegt.
  eq(mkpSamenvatting(gelezen), v.samenvatting, `${naam}: samenvatting ongewijzigd`);
  eq(mkpVerdeelinrichting(gelezen), v.verdeelinrichting, `${naam}: verdeelinrichting ongewijzigd`);

  // 6. Een paspoort dat past, laat het afkappen ongemoeid.
  if (v.modules <= QR_MODULES_GRENS) {
    const a = await mkpAfkappen(gelezen);
    eq([a.past, a.melding, a.paspoort], [true, "", f.paspoort], `${naam}: afkappen laat een passend paspoort ongemoeid`);
  }
}

// Het grensgeval staat er echt: precies op de grens van hoofdstuk 6.
{
  const g = JSON.parse(readFileSync(new URL("grens-105.json", map), "utf8"));
  eq(g.verwacht.modules, QR_MODULES_GRENS, "grens-105: het fixture zit precies op 105 modules");
  eq(g.verwacht.controle.log.at(-1).handtekening, "geldig", "grens-105: de ondertekende regel onderaan verifieert nog");
}

console.log("\n═══════════════════════════════════════════════");
console.log(`RESULTAAT: ${passed} geslaagd · ${failed} mislukt · ${passed + failed} totaal`);
console.log("═══════════════════════════════════════════════");
if (failures.length) {
  console.log("\n⚠️  MISLUKTE TESTS:");
  failures.forEach((f) => console.log("  " + f));
  process.exit(1);
}
console.log("\n✅ De vaste testpaspoorten lezen zoals vandaag");
