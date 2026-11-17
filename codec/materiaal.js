// De woordenlijst van de materiaallijst (spec 4.5): welke soortcodes `mat[].s` kent, en de plaats `mat[].pos` ("R1-5", "V2-R1-5") lezen en schrijven.
//
// Tot 17-11-2026 stond deze kennis alleen in de rekenkern van de apps
// (yourwkb-core: mkp-materiaal.js en paspoort-kastbeeld.js). Het is kennis van
// het formaat, dus hoort hij hier: één plek, voor elke lezer en schrijver.

// De soortcodes van mat[].s (spec 4.5), met wat ze betekenen. Een lezer die een
// andere code tegenkomt, behandelt hem als "overig" en laat hem staan.
export const MKP_MAT_SOORTEN = Object.freeze({
  hs: "hoofdschakelaar",
  als: "aardlekschakelaar",
  ala: "aardlekautomaat",
  aut: "installatieautomaat",
  kam: "kamrail",
  tr: "transformator",
  ov: "overig",
});

const PLAATS = /^(?:V(\d+)-)?R(\d+)-(\d+)$/;

// "R1-5" → { verdeler: 1, rail: 1, positie: 5 }; "V2-R1-5" → verdeler 2.
// Rail en positie tellen vanaf 1 (positie in modules, van links). Geeft null bij
// een ontbrekende of onleesbare plaats: dat is geen fout, maar een toestel
// waarvan destijds geen plaats is vastgelegd.
export function mkpPlaatsLezen(pos) {
  const m = PLAATS.exec(String(pos ?? "").trim());
  if (!m) return null;
  const uit = { verdeler: m[1] ? Number(m[1]) : 1, rail: Number(m[2]), positie: Number(m[3]) };
  return uit.verdeler >= 1 && uit.rail >= 1 && uit.positie >= 1 ? uit : null;
}

// { verdeler, rail, positie } → "R1-5", of "V2-R1-5" vanaf de tweede verdeler.
// Geeft null als rail of positie geen geheel getal vanaf 1 is: liever geen
// plaats dan een verzonnen plaats.
export function mkpPlaatsTekst({ verdeler = 1, rail, positie } = {}) {
  const heel = (x) => Number.isInteger(x) && x >= 1;
  if (!heel(rail) || !heel(positie) || !heel(verdeler)) return null;
  return `${verdeler > 1 ? `V${verdeler}-` : ""}R${rail}-${positie}`;
}
