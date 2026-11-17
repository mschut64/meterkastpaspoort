// Gebruikerstekst in het Nederlands over een paspoort: samenvatting, verdeelinrichting en meldingen over de QR. Hoort op termijn niet in de codec.
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

import { _isObj } from "./hulp.js";
import { QR_TEKENS_GRENS } from "./qr.js";

// Korte leesbare samenvatting van een (gescand) paspoort, voor de UI.
export function mkpSamenvatting(p) {
  if (!p) return "meterkastpaspoort";
  const delen = [];
  if (p.pc || p.nr) delen.push(`${p.pc || ""} ${p.nr || ""}`.trim());
  if (p.ha) delen.push(`${p.ha.f || "?"}×${p.ha.a || "?"}A`);
  if (p.kam) delen.push(`kam ${p.kam.a || "?"}A`);
  if (p.bj) delen.push(`aanleg ${p.bj}`);
  if (Array.isArray(p.grp)) delen.push(`${p.grp.length} groepen`);
  if (p.log && p.log[0]) delen.push(`laatst: ${p.log[0].b} (${p.log[0].d})`);
  return delen.join(" · ") || "meterkastpaspoort";
}

// ─── Meerdere verdeelinrichtingen (voorstel v0.4, spec 4.9) ──────────────────
//
// Waar deze kast aan hangt, en welke groepen een andere kast voeden — als
// leesbare zinnen, zodat elke lezer (lezer.html, YourWkb, Kastscan) hetzelfde
// zegt. Platte tekst: de lezer ontsnapt hem zelf vóór weergave (§3.1).
//
// ⚓ Een verwijzing zegt niets over de andere kast. Is die niet gescand, dan
// blijft het bij de verwijzing; de functie leidt nergens iets uit af.
// Zonder vd, voed en grp[].vd: null — bij één kast verandert er niets.
const _INBOUW = { vrij: "vrijstaand", wand: "tegen de wand", nis: "ingebouwd in een nis" };
const _getal = (x) => (typeof x === "number" && Number.isFinite(x) ? String(x).replace(".", ",") : "");
const _tekst = (x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : "");
// Een id ("HV", "OV1") of — als de voedende kast geen paspoort heeft — een omschrijving.
const _kastNaam = (v) => (/^[A-Za-z]{1,4}\d{0,3}$/.test(v) ? `verdeelinrichting ${v}` : v);

export function mkpVerdeelinrichting(p) {
  if (!_isObj(p)) return null;
  const vd = _isObj(p.vd) ? p.vd : null;
  const voed = _isObj(p.voed) ? p.voed : null;
  const voedt = (Array.isArray(p.grp) ? p.grp : [])
    .map((g, i) => (_isObj(g) && _tekst(g.vd) ? { groep: i, vd: _tekst(g.vd), tekst: `voedt ${_kastNaam(_tekst(g.vd))}` } : null))
    .filter(Boolean);
  if (!vd && !voed && !voedt.length) return null;

  const id = vd ? _tekst(vd.id) : "";
  const rol = vd && vd.rol === "onder" ? "onderverdeler" : vd && vd.rol === "hoofd" ? "hoofdverdeler" : (voed ? "onderverdeler" : "");
  const naam = (vd && _tekst(vd.n)) || rol;
  const kast = vd ? [naam + (id ? ` (${id})` : ""), _tekst(vd.plaats), _INBOUW[vd.inb] || ""].filter(Boolean).join(" · ") : "";

  let gevoed = null;
  if (voed && _tekst(voed.vd)) {
    const grp = _getal(voed.grp);
    const kabel = [_getal(voed.mm2) && `${_getal(voed.mm2)} mm²`, _getal(voed.lng) && `${_getal(voed.lng)} m`].filter(Boolean).join(", ");
    gevoed = {
      tekst: `gevoed vanaf ${grp ? `groep ${grp} van ` : ""}${_kastNaam(_tekst(voed.vd))}`,
      details: [_getal(voed.a) && `beveiliging ${_getal(voed.a)} A`, kabel && `voedingskabel ${kabel}`].filter(Boolean).join(" · "),
    };
  }
  return { id, rol, kast, gevoed, voedt };
}

export function qrWaarschuwing(tekens) {
  if (tekens <= QR_TEKENS_GRENS) return "";
  return `De QR draagt ${tekens} tekens en wordt daarmee dicht. Kort de groepsnamen in of laat de logboekhistorie weg.`;
}

// De ene regel die de app toont als mkpAfkappen iets heeft weggelaten, of als
// het daarna nog steeds niet past. Uit mkpAfkappen gehaald zodat de codec zelf
// geen gebruikerstekst maakt; de tekst is ongewijzigd.
export function _afkapMelding(weg, past, modules) {
  const mv = (n, enk, mvv) => `${n} ${n === 1 ? enk : mvv}`;
  const delen = [];
  if (weg.logregels) delen.push(`${mv(weg.logregels, "oudste logboekregel", "oudste logboekregels")} weggelaten`);
  if (weg.detailvelden) delen.push(`serienummer en productiecode weggelaten bij ${mv(weg.detailvelden, "toestel", "toestellen")} zonder artikelnummer`);
  if (weg.matregels) delen.push(`${mv(weg.matregels, "toestel", "toestellen")} uit de materiaallijst weggelaten`);
  if (weg.omschrijvingen) delen.push(`${mv(weg.omschrijvingen, "groepsomschrijving", "groepsomschrijvingen")} ingekort`);
  // Hoofdstuk 6: meld wat niet is meegenomen, "zodat die het volledige overzicht in
  // het opleverdocument kan opzoeken".
  let melding = delen.length ? `Om de QR leesbaar te houden: ${delen.join(", ")}. Het volledige overzicht staat in het opleverdocument.` : "";
  if (!past) melding = (melding ? melding + " " : "") +
    `De code blijft ${modules === Infinity ? "te groot voor een QR" : modules + " modules"} — te dicht voor een sticker van 50 mm.`;
  return melding;
}
