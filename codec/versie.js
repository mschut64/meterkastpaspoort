// Versieherkenning: een paspoort lezen en zeggen welk datamodel het heeft, of deze lezer dat kent, welk profiel het draagt en welke velden onbekend zijn.

import { mkpDecode } from "./coderen.js";
import { _isObj } from "./hulp.js";

// ─────────────────────────────────────────────────────────────────────────────
// Wat de spec zegt (index.html):
//   · 4 Datamodel: "Alle velden zijn optioneel tenzij anders vermeld; lezers
//     negeren onbekende velden."
//   · 4.1 `v`: 2 voor dit document, 1 voor paspoorten volgens v0.1 (een lezer
//     die 1 aantreft hanteert de oude uitleg van `f`).
//   · 11.1: "Lezers behoren paspoorten met een hogere versie zo goed mogelijk
//     weer te geven en onbekende velden te negeren."
// Dus: een hoger datamodel wordt NIET geweigerd. mkpLees geeft het paspoort
// ongewijzigd terug en zegt erbij dat het nieuwer is dan deze lezer kent; de
// toepassing toont wat zij herkent en slaat de rest over.
// ─────────────────────────────────────────────────────────────────────────────

// De datamodellen (`v`) die deze codec kent. 1 = v0.1, 2 = documentversie 0.2–0.3.
// 3 = voorstel v0.4 (datamodel 3: indeling `ind` en volgende inspectie `frq`, besluiten 17-11-2026;
// stelsel `stl` en meetwaarden `mw[]` erbij, besluiten 23-11-2026).
export const MKP_DATAMODELLEN = Object.freeze([1, 2, 3]);

// De velden die deze codec kent, per blok. "" is het wortelobject; de andere
// sleutels zijn de blokken en lijsten uit hoofdstuk 4 (een lijst: de velden van
// één element). Afgeleid uit spec 4.1–4.9 (documentversie 0.3, met het voorstel
// v0.4 voor vd/voed/grp[].vd dat de codec al leest en schrijft). Sinds 25-11-2026
// ook de ontwerpintentie: de reservering `res[]` en haar grondslag `grond` (4.11).
// De ENIGE plek met deze lijst.
export const MKP_VELDEN = Object.freeze({
  "":   Object.freeze(["v", "d", "pc", "nr", "ean", "ean2", "bj", "stl", "ha", "kam", "grp", "mat", "lb", "chk", "log", "vd", "voed", "ind", "frq", "mw", "res", "grond"]),
  ha:   Object.freeze(["f", "a", "hs"]),
  kam:  Object.freeze(["mm2", "a"]),
  grp:  Object.freeze(["t", "rol", "kw", "f", "fn", "mat", "n", "vd"]),
  mat:  Object.freeze(["i", "s", "fab", "typ", "art", "sn", "pd", "pos"]),
  lb:   Object.freeze(["aan", "typ", "max", "reg"]),
  chk:  Object.freeze(["r", "d"]),
  log:  Object.freeze(["d", "b", "w", "erk", "c", "zeg", "ma", "sid", "sig"]),
  vd:   Object.freeze(["id", "n", "rol", "plaats", "inb"]),
  voed: Object.freeze(["vd", "grp", "a", "mm2", "lng"]),
  // Voorstel v0.4, besluit 23-11-2026: de meetwaarden, alleen in profiel volledig.
  mw:   Object.freeze(["s", "w", "g", "p", "d", "c"]),
  // Voorstel v0.4, besluit Martin 25-11-2026: de ontwerpintentie, op de sticker.
  res:   Object.freeze(["t", "pos", "mod", "f", "fn", "a", "kw", "n"]),
  // `pb` en `pr` erbij, 28-11-2026: de warmtehuishouding. `rest` zegt hoeveel
  // ampère er elektrisch over is; dat is de halve vraag. Een uitbreiding met een
  // laadpaal, PV of een thuisbatterij draagt gelijktijdigheidsfactor 1,0 — die is
  // continu belast — en past daarom lang niet altijd in de warmtebalans, ook als
  // er modules vrij zijn en de hoofdzekering het aankan. `pb` is het
  // verliesvermogensbudget van de kast in hele watt, `pr` wat daarvan over is.
  // Een lezer die ze niet kent slaat ze over (spec 11.1).
  grond: Object.freeze(["d", "ha", "kam", "gl", "rest", "door", "pb", "pr"]),
});

// Velden op het hoogste niveau die deze codec niet kent, in de volgorde van het paspoort.
function _onbekendBovenaan(p) {
  return _isObj(p) ? Object.keys(p).filter((k) => !MKP_VELDEN[""].includes(k)) : [];
}

// Alle onbekende velden als pad ("xyz", "ha.xyz", "grp[].xyz"), uniek, op elke
// diepte die de spec beschrijft. Binnen een onbekend blok wordt niet verder
// gekeken: het blok zelf is al onbekend.
export function mkpOnbekendePaden(p) {
  const uit = [];
  const voeg = (pad) => { if (!uit.includes(pad)) uit.push(pad); };
  if (!_isObj(p)) return uit;
  for (const k of Object.keys(p)) {
    if (!MKP_VELDEN[""].includes(k)) { voeg(k); continue; }
    const bekend = MKP_VELDEN[k];
    if (!bekend) continue;
    const lijst = Array.isArray(p[k]);
    const elementen = lijst ? p[k] : [p[k]];
    for (const e of elementen) {
      if (!_isObj(e)) continue;
      for (const sub of Object.keys(e))
        if (!bekend.includes(sub)) voeg(`${k}${lijst ? "[]" : ""}.${sub}`);
    }
  }
  return uit;
}

// Neemt een fragment, of een webadres met het fragment achter '#'
// (https://meterkastpaspoort.nl/p#…). Ongeldige invoer geeft dezelfde fout als
// mkpDecode, want die doet het lezen. Geeft:
//   paspoort       het object, ongewijzigd (ook velden die onbekend zijn)
//   datamodel      het getal `v`
//   bekend         kent deze codec dit datamodel?
//   nieuwer        is het datamodel hoger dan het hoogste dat deze codec kent?
//                  Dan "zo goed mogelijk" lezen (spec 11.1), niet weigeren.
//   profiel        null: het datamodel 1 of 2 heeft geen profielveld, en bij een
//                  onbekend datamodel weet deze codec niet waar het zou staan
//   profielStatus  "niet-van-toepassing" (datamodel 1/2) of "onbekend"
//   onbekend       velden op het hoogste niveau die deze codec niet kent
export async function mkpLees(fragmentOfUrl) {
  const tekst = String(fragmentOfUrl || "");
  const hekje = tekst.indexOf("#");
  const paspoort = await mkpDecode(hekje >= 0 ? tekst.slice(hekje + 1) : tekst);
  const datamodel = paspoort.v;
  const bekend = MKP_DATAMODELLEN.includes(datamodel);
  return {
    paspoort,
    datamodel,
    bekend,
    nieuwer: datamodel > Math.max(...MKP_DATAMODELLEN),
    // Datamodel 3 (v0.4): een sticker draagt de kern; het profielveld komt pas
    // als er een ander profiel in een QR kan staan.
    profiel: datamodel === 3 ? "kern" : null,
    profielStatus: !bekend ? "onbekend" : datamodel === 3 ? "kern" : "niet-van-toepassing",
    onbekend: _onbekendBovenaan(paspoort),
  };
}
