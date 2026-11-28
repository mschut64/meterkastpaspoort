// Een paspoort terugbrengen tot wat op de sticker hoort, en als het niet past:
// alleen de indeling weglaten, en anders weigeren (hoofdstuk 6).
// Voorstel v0.4, besluiten 23-11-2026 (vervangt de afkapvolgorde van 17-11-2026).

import { mkpUrl } from "./coderen.js";
import { QR_MODULES_GRENS, qrModules } from "./qr.js";
import { mkpProfiel } from "./profielen.js";
import { _afkapMelding } from "./teksten.js";

// De volgorde, vast voor elke implementatie:
//
//   1. Het profiel KERN (mkpProfiel): wat in inspectie of volledig hoort gaat
//      eraf — de materiaallijst met artikelnummers, grp[].mat, de meetwaarden.
//      Dat is geen afkappen maar de definitie van de sticker; de app geeft die
//      gegevens mee in het volledige paspoort.
//   2. Past het niet onder de grens: het meetanker (`log[].ma`) eraf, van elke
//      logregel die NIET ondertekend is (besluit Martin 24-11-2026: het anker
//      wijkt vóór de indeling). De regel zelf blijft staan; bij een ondertekende
//      regel blijft het anker staan, want weghalen breekt zijn handtekening.
//   3. Past het dan nog niet: de indeling (`ind`) eraf.
//   4. Past het dan nog niet: WEIGEREN. Er wordt niets ingekort en niets
//      weggelaten; de uitkomst zegt dat er geen sticker kan komen.
//
// NOOIT, onder geen enkele omstandigheid: de identiteit (pc, nr, ean, ean2, bj),
// het stelsel, grp[] (ook de omschrijvingen niet), de logboekregels zelf, en
// elke handtekening, en de reservering met haar grondslag (res, grond — besluit
// Martin 25-11-2026: juist voor de volgende installateur). Ook de andere kernvelden (ha, kam, lb, chk, vd, voed, frq)
// en onbekende velden blijven staan: alleen het meetanker van een niet
// ondertekende regel en `ind` mogen wijken.
//
// Geeft { paspoort, modules, past, geweigerd, weggelaten, melding }:
//   weggelaten.naarVolledig  paden die niet op de sticker horen (stap 1)
//   weggelaten.meetanker     aantal logregels waar stap 2 het meetanker weghaalde
//   weggelaten.indeling      true als stap 3 de indeling weghaalde
//   geweigerd                true als ook stap 2 niet genoeg was; `paspoort` is
//                            dan de kern zonder indeling, en hoort NIET op een sticker
//   melding                  één regel voor de gebruiker, leeg als er niets weg is
export async function mkpAfkappen(paspoort, { maxModules = QR_MODULES_GRENS } = {}) {
  const { paspoort: p, weggelaten: naarVolledig } = mkpProfiel(paspoort, "kern");
  const meet = async () => qrModules((await mkpUrl(p)).length);
  let modules = await meet();
  let meetanker = 0;
  if (modules > maxModules && Array.isArray(p.log)) {
    for (const r of p.log) {
      if (r && typeof r === "object" && "ma" in r && !("sig" in r)) { delete r.ma; meetanker++; }
    }
    if (meetanker) modules = await meet();
  }
  let indeling = false;
  if (modules > maxModules && "ind" in p) {
    // ⚓ `kamb[]` gaat mee. Zijn `al` verwijst naar de nummering van het
    // indelingsblok; zonder dat blok is niet te zeggen bij welk aardlekblok een
    // kam hoort, en blijven er getallen op de sticker staan die niemand kan
    // plaatsen. De verdelerkam `kam` blijft wel staan — die hangt nergens aan.
    delete p.ind; delete p.kamb; indeling = true;
    modules = await meet();
  }
  const past = modules <= maxModules;
  const weggelaten = { naarVolledig, meetanker, indeling };
  return { paspoort: p, modules, past, geweigerd: !past, weggelaten,
    melding: _afkapMelding(weggelaten, past, modules, maxModules) };
}
