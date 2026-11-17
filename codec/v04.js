// Versie 0.4 in de payload (voorstel, besluiten 17-11-2026): datamodel 3 met het indelingsblok (`ind`) en de volgende inspectie (`frq`) — veilig schrijven en lezen.
//
// Besluit 2: v0.4 krijgt een eigen versienummer in de payload; lezers blijven
// datamodel 1 en 2 lezen. Datamodel 3 voegt alleen optionele velden toe, dus een
// lezer van v0.3 slaat ze over en toont de rest (spec 11.1). Nieuwe stickers in
// v0.4 pas als alle lezers v0.4 kennen — de apps schrijven het daarom achter een
// schakelaar.
//
// Besluit 6: het indelingsblok gaat als TEKST in het bestaande webadres — hier als
// JSON-veld `ind` (base64url van het blok), zodat elke telefooncamera de sticker
// blijft openen en een lezer van v0.3 er niet op breekt.
//
// Besluit 5: van de inspectie alleen de datum van de volgende inspectie, `frq`,
// als "JJJJ-MM" (maandresolutie, featurespec paspoort voor de inspecteur §2.1).
//
// v0.4 §5: alleen een GEMETEN indeling hoort op een sticker. Een ontwerp of een
// kast die nog niet is doorgemeten, is een voornemen en geen vaststelling; die
// komt hier niet doorheen.

import { mkpIndelingUitpakken } from "./indeling.js";
import { _isObj, _kopie } from "./hulp.js";

export const MKP_V04_DATAMODEL = 3;
const FRQ = /^(\d{4})-(0[1-9]|1[0-2])$/;

// De volgende inspectie, of null als hij ontbreekt of niet de vorm JJJJ-MM heeft.
export function mkpVolgendeInspectie(p) {
  const f = _isObj(p) ? p.frq : null;
  return typeof f === "string" && FRQ.test(f) ? f : null;
}

// Het indelingsblok van een paspoort, uitgepakt. Geeft:
//   null                              er is geen blok
//   { indeling }                      gelezen
//   { overgeslagen: true, versie }    een blokversie die deze codec niet kent
//   { fout }                          kapot; de rest van het paspoort blijft leesbaar
export function mkpIndeling(p) {
  if (!_isObj(p) || p.ind === undefined || p.ind === null || p.ind === "") return null;
  if (typeof p.ind !== "string") return { fout: "indeling: geen tekst" };
  try {
    const u = mkpIndelingUitpakken(p.ind);
    return u.overgeslagen ? { overgeslagen: true, versie: u.versie } : { indeling: u };
  } catch (e) {
    return { fout: e.message };
  }
}

// Zet een paspoort op v0.4: datamodel 3, met `ind` en `frq` als ze geldig zijn.
// Een kopie; het origineel blijft ongewijzigd. Wat niet meegaat staat in
// `weggelaten`, met de reden.
//
//   ind  de tekst van mkpIndelingInpakken, of null. Een `ind` die al in het
//        paspoort staat en hier niet wordt aangeleverd, gaat ERUIT: een oude
//        indeling beschrijft een kast die misschien niet meer zo hangt.
//   frq  "JJJJ-MM", of null. Zonder nieuwe datum BLIJFT een geldige bestaande
//        staan: een installateur kent de datum van de inspecteur niet en mag hem
//        dus ook niet wissen (paspoortbehoud; review 17-11-2026).
export function mkpZetV04(paspoort, { ind = null, frq = null } = {}) {
  const p = _kopie(paspoort) || {};
  const weggelaten = [];
  const oudeFrq = mkpVolgendeInspectie(p);
  delete p.ind; delete p.frq;
  p.v = Math.max(typeof p.v === "number" ? p.v : 0, MKP_V04_DATAMODEL);
  if (ind) {
    const gelezen = mkpIndeling({ ind });
    if (!gelezen || gelezen.fout) weggelaten.push({ veld: "ind", reden: (gelezen && gelezen.fout) || "geen indeling" });
    else if (gelezen.overgeslagen) weggelaten.push({ veld: "ind", reden: `blokversie ${gelezen.versie} onbekend` });
    else if (gelezen.indeling.st !== "gemeten") weggelaten.push({ veld: "ind", reden: `status ${gelezen.indeling.st}: alleen een gemeten indeling hoort op een sticker (v0.4 §5)` });
    else p.ind = ind;
  }
  if (frq !== null && frq !== undefined && frq !== "") {
    if (FRQ.test(String(frq))) p.frq = String(frq);
    else { weggelaten.push({ veld: "frq", reden: `"${frq}" is niet JJJJ-MM` }); if (oudeFrq) p.frq = oudeFrq; }
  } else if (oudeFrq) p.frq = oudeFrq;
  return { paspoort: p, weggelaten };
}

// Een paspoort zonder indeling (voor een schrijver van v0.3 die een v0.4-sticker
// hergebruikt): de oude indeling gaat eruit, de rest blijft. `v` gaat niet omlaag.
export function mkpZonderIndeling(paspoort) {
  const p = _kopie(paspoort) || {};
  delete p.ind;
  return p;
}
