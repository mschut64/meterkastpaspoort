// De drie profielen (kern, inspectie, volledig): welk veld in welk profiel hoort, een paspoort tot een profiel terugbrengen, en de maat van de sticker meten tegen streefwaarde en grens.
//
// Voorstel v0.4, bijgesteld aan de besluiten van 17-11-2026
// (docs/claude_paspoort-codec-besluiten-2026-11-17.md in de veldapp):
//
//   kern       de QR op de kast: "wat moet ik weten zonder internet, vóór de
//              kast?" Alles wat v0.3 al op de sticker zet, plus de verwijzing
//              naar onderverdelers (vd, voed, grp[].vd — besluit 8) en van de
//              inspectie ALLEEN de datum van de volgende inspectie (`frq`,
//              besluit 5). Niet de SCIOS-code, niet het aantal open
//              constateringen: die blijven in het dossier.
//   inspectie  het bestand van de inspecteur: kern + identificatiecode (`idc`),
//              open constateringen (`con[]`), steekproefhistorie (`stp[]`) en
//              de meetmiddelen per logregel (`log[].mm`). (Featurespec paspoort
//              voor de inspecteur, 15-11-2026; de velden zelf zijn nog een
//              voorstel en worden hier alleen bij naam gekend.)
//   volledig   alles: kern + inspectie + de reservering en haar grondslag
//              (`res[]`, ontwerpintentie — besluit 8: niet in de kern).
//
// Elk profiel is een uitbreiding van het vorige. Een veld dat in geen enkel
// profiel genoemd wordt, is ONBEKEND en blijft altijd staan: nooit iets
// weglaten op grond van "dit veld ken ik niet" (hoofdstuk 6, spec 11.1).
//
// Het profiel staat (nog) niet in de payload: dat is een v0.4-wijziging die pas
// geschreven wordt als alle lezers v0.4 kennen (besluit 2). mkpLees zegt daarom
// voor datamodel 1/2 nog steeds "niet-van-toepassing".

import { mkpUrl } from "./coderen.js";
import { QR_MODULES_GRENS, qrModules } from "./qr.js";
import { _isObj, _kopie } from "./hulp.js";

export const MKP_PROFIELEN = Object.freeze(["kern", "inspectie", "volledig"]);

// Wat een profiel BOVEN het vorige toevoegt. "veld" is een veld van het
// wortelobject, "blok.veld" een veld binnen elk element van een lijst.
// De ENIGE plek met deze indeling.
export const MKP_PROFIEL_VELDEN = Object.freeze({
  kern: Object.freeze([
    // v0.3 (spec 4.1–4.8), zonder mat[] (besluit 23-11-2026: naar volledig)
    "v", "d", "pc", "nr", "ean", "ean2", "bj", "ha", "kam", "grp", "lb", "chk", "log",
    // voorstel v0.4: het stelsel (besluit 23-11-2026)
    "stl",
    // voorstel v0.4: meerdere verdeelinrichtingen (spec 4.9), besluit 8
    "vd", "voed",
    // voorstel v0.4: van de inspectie alleen de volgende inspectiedatum, besluit 5
    "frq",
    // voorstel v0.4: het indelingsblok, als tekst (besluit 6)
    "ind",
  ]),
  inspectie: Object.freeze(["idc", "con", "stp", "log.mm"]),
  // besluit 23-11-2026: de materiaallijst (met artikelnummers) en de koppeling
  // ernaar, en de meetwaarden, staan alleen in het volledige dossier.
  volledig: Object.freeze(["res", "mat", "grp.mat", "mw"]),
});

// Streefwaarde en grens van de sticker (besluit 9): 600 tekens is de streefwaarde,
// de harde grens blijft 105 QR-modules op niveau M (±780 tekens).
export const MKP_STREEF_TEKENS = 600;

// In welk profiel een veld voor het eerst hoort; null = onbekend (dan altijd laten staan).
export function mkpProfielVan(pad) {
  for (const prof of MKP_PROFIELEN) if (MKP_PROFIEL_VELDEN[prof].includes(pad)) return prof;
  return null;
}

// Mag dit veld in dit profiel? Onbekende velden mogen altijd.
function _mag(pad, profiel) {
  const van = mkpProfielVan(pad);
  return van === null || MKP_PROFIELEN.indexOf(van) <= MKP_PROFIELEN.indexOf(profiel);
}

// Een kopie van het paspoort met alleen wat in dit profiel hoort. Het origineel
// blijft ongewijzigd. Weggelaten velden staan in `weggelaten` (als pad), zodat
// een app kan zeggen wat er in het dossier staat en niet op de sticker.
// Een handtekening wordt hier nooit aangeraakt: velden die in een ondertekende
// logregel staan en niet in het profiel horen (log[].mm), maken de handtekening
// ongeldig als ze wegvallen — daarom blijft zo'n regel dan heel en staat hij in
// `nietIngekort`.
export function mkpProfiel(paspoort, profiel = "kern") {
  if (!MKP_PROFIELEN.includes(profiel)) throw new Error(`onbekend profiel: ${profiel}`);
  const p = _kopie(paspoort) || {};
  const weggelaten = [];
  const nietIngekort = [];
  for (const k of Object.keys(p)) {
    if (!_mag(k, profiel)) { delete p[k]; weggelaten.push(k); continue; }
    if (!Array.isArray(p[k])) continue;
    p[k].forEach((e, i) => {
      if (!_isObj(e)) return;
      const weg = Object.keys(e).filter((sub) => !_mag(`${k}.${sub}`, profiel));
      if (!weg.length) return;
      if (k === "log" && "sig" in e) { nietIngekort.push(`${k}[${i}]`); return; }
      for (const sub of weg) { delete e[sub]; if (!weggelaten.includes(`${k}[].${sub}`)) weggelaten.push(`${k}[].${sub}`); }
    });
  }
  return { paspoort: p, profiel, weggelaten, nietIngekort };
}

// De maat van de sticker: hoeveel tekens de URL telt, hoeveel QR-modules dat
// wordt, en of het binnen de streefwaarde en binnen de grens blijft.
export async function mkpGrootte(paspoort, { maxModules = QR_MODULES_GRENS, streefTekens = MKP_STREEF_TEKENS } = {}) {
  const tekens = (await mkpUrl(paspoort)).length;
  const modules = qrModules(tekens);
  return { tekens, modules, streef: streefTekens, grens: maxModules,
    binnenStreef: tekens <= streefTekens, past: modules <= maxModules };
}
