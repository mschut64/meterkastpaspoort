// Een te groot paspoort in een vaste volgorde inkorten tot het op de sticker past (hoofdstuk 6).
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

import { mkpUrl } from "./coderen.js";
import { QR_MODULES_GRENS, qrModules } from "./qr.js";
import { _isObj, _kopie } from "./hulp.js";
import { _afkapMelding } from "./teksten.js";

// Past het paspoort niet onder de grens, dan valt er in een VASTE volgorde iets
// weg, zodat alle implementaties dezelfde gegevens als eerste laten vallen
// (featurespec paspoortbehoud §5, hoofdstuk 6):
//
//   0. de handtekeningen (sig en sid) van oudere logboekregels, van onderen af —
//      de regels zelf blijven staan, zonder handtekening. De nieuwste ONDERTEKENDE
//      regel houdt de zijne: dat is "de laatste klus" van het besluit. (De eigen
//      regel die een app bovenaan zet is vaak nog niet ondertekend; zou log[0]
//      beschermd worden, dan verdween juist de laatste echte handtekening.)
//      (besluit 17-11-2026, voorstel v0.4: "als de sticker vol is, gaan oude
//      handtekeningen als eerste weg"); een handtekening dekt alleen zijn eigen
//      regel, dus de andere regels blijven verifieerbaar;
//   1. de oudste logboekregels, van onderen af — de nieuwste blijft altijd staan;
//   2. sn en pd van toestellen zonder art: zonder artikelnummer matcht een
//      terugroepactie toch niet betrouwbaar;
//   3. hele mat-regels, te beginnen bij toestellen zonder art én zonder sn;
//   4. als laatste de vrije omschrijvingen van de groepen (grp[].n) inkorten.
//
// Twee dingen gebeuren NOOIT. Een logboekregel wordt nooit inhoudelijk ingekort:
// het logboek is historie, en een ondertekende regel die je wijzigt is een
// vervalste regel. Stap 0 wijzigt niets aan wat er staat: zonder sig is de regel
// "niet ondertekend", nooit "handtekening komt niet overeen". En er wordt nooit afgekapt op grond van
// een onbekend veld — past het daarna nog niet, dan zegt de uitkomst dat, en
// blijft het onbekende veld staan.
//
// Geeft terug: { paspoort, modules, past, weggelaten, melding }. `melding` is de
// ene regel die de app bij afkappen toont; leeg als er niets is weggelaten.
export async function mkpAfkappen(paspoort, { maxModules = QR_MODULES_GRENS } = {}) {
  const p = _kopie(paspoort) || {};
  const weg = { handtekeningen: 0, logregels: 0, detailvelden: 0, matregels: 0, omschrijvingen: 0 };
  let modules = qrModules((await mkpUrl(p)).length);
  const meet = async () => { modules = qrModules((await mkpUrl(p)).length); };
  const past = () => modules <= maxModules;

  // 0. Handtekeningen van oudere logboekregels; de nieuwste ondertekende houdt de zijne.
  const zonderHandtekening = new Set();
  if (Array.isArray(p.log)) {
    const laatste = p.log.findIndex((r) => _isObj(r) && "sig" in r);
    for (let i = p.log.length - 1; i > laatste && laatste >= 0 && !past(); i--) {
      const r = p.log[i];
      if (!_isObj(r) || !("sig" in r || "sid" in r)) continue;
      delete r.sig; delete r.sid; zonderHandtekening.add(r); await meet();
    }
  }
  // 1. Oudste logboekregels.
  while (!past() && Array.isArray(p.log) && p.log.length > 1) {
    p.log.pop(); weg.logregels++; await meet();
  }
  // 2. sn en pd van toestellen zonder art, van achteren naar voren.
  if (Array.isArray(p.mat)) {
    for (let i = p.mat.length - 1; i >= 0 && !past(); i--) {
      const m = p.mat[i];
      if (!_isObj(m) || m.art || !("sn" in m || "pd" in m)) continue;
      delete m.sn; delete m.pd; weg.detailvelden++; await meet();
    }
  }
  // 3. Hele mat-regels: eerst zonder art én zonder sn, daarna de rest.
  if (Array.isArray(p.mat)) {
    for (const eerst of [true, false]) {
      for (let i = p.mat.length - 1; i >= 0 && !past(); i--) {
        const m = p.mat[i];
        if (eerst && _isObj(m) && (m.art || m.sn)) continue;
        const [weggehaald] = p.mat.splice(i, 1); weg.matregels++;
        // Een groep die naar dit toestel verwees, verwijst nu nergens heen.
        if (_isObj(weggehaald) && Array.isArray(p.grp))
          for (const g of p.grp) if (_isObj(g) && g.mat === weggehaald.i) delete g.mat;
        await meet();
      }
    }
  }
  // 4. Vrije omschrijvingen van de groepen, eerst tot 24 en zo nodig tot 12 tekens.
  if (Array.isArray(p.grp)) {
    const ingekort = new Set();
    for (const grens of [24, 12]) {
      for (let i = p.grp.length - 1; i >= 0 && !past(); i--) {
        const g = p.grp[i];
        if (!_isObj(g) || typeof g.n !== "string" || g.n.length <= grens) continue;
        g.n = g.n.slice(0, grens - 1) + "…"; ingekort.add(i); await meet();
      }
    }
    weg.omschrijvingen = ingekort.size;
  }

  // Alleen de regels die er nog staan: een regel die stap 1 daarna weghaalde,
  // telt bij de weggelaten regels, niet ook nog bij de handtekeningen.
  weg.handtekeningen = Array.isArray(p.log) ? p.log.filter((r) => zonderHandtekening.has(r)).length : 0;
  const melding = _afkapMelding(weg, past(), modules);
  return { paspoort: p, modules, past: past(), weggelaten: weg, melding };
}
