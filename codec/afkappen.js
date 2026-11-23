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
//   2. Past het niet onder de grens: de indeling (`ind`) eraf.
//   3. Past het dan nog niet: WEIGEREN. Er wordt niets ingekort en niets
//      weggelaten; de uitkomst zegt dat er geen sticker kan komen.
//
// NOOIT, onder geen enkele omstandigheid: de identiteit (pc, nr, ean, ean2, bj),
// het stelsel, grp[] (ook de omschrijvingen niet), de logboekregels zelf, en
// elke handtekening. Ook de andere kernvelden (ha, kam, lb, chk, vd, voed, frq)
// en onbekende velden blijven staan: alleen `ind` mag wijken.
//
// Geeft { paspoort, modules, past, geweigerd, weggelaten, melding }:
//   weggelaten.naarVolledig  paden die niet op de sticker horen (stap 1)
//   weggelaten.indeling      true als stap 2 de indeling weghaalde
//   geweigerd                true als ook stap 2 niet genoeg was; `paspoort` is
//                            dan de kern zonder indeling, en hoort NIET op een sticker
//   melding                  één regel voor de gebruiker, leeg als er niets weg is
export async function mkpAfkappen(paspoort, { maxModules = QR_MODULES_GRENS } = {}) {
  const { paspoort: p, weggelaten: naarVolledig } = mkpProfiel(paspoort, "kern");
  const meet = async () => qrModules((await mkpUrl(p)).length);
  let modules = await meet();
  let indeling = false;
  if (modules > maxModules && "ind" in p) {
    delete p.ind; indeling = true;
    modules = await meet();
  }
  const past = modules <= maxModules;
  const weggelaten = { naarVolledig, indeling };
  return { paspoort: p, modules, past, geweigerd: !past, weggelaten,
    melding: _afkapMelding(weggelaten, past, modules, maxModules) };
}
