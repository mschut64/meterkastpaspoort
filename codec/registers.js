// De tabel van uitgevers van erkenningen en certificaten en de registers waarin een mens ze kan opzoeken, met een opzoekfunctie voor log[].erk.

// ─────────────────────────────────────────────────────────────────────────────
// Waarom deze tabel
//
// Tot 17-11-2026 bestonden er twee lijsten met verschillende inhoud: één in de
// veldapp (YourWkb, components/wkb/mkp-bouw.js: ERK_UITGEVERS, CO_UITGEVERS,
// CO_REGISTER) en één in de ondertekende index (veldnotities/index.json ›
// erkenners[]). Deze tabel is de bron voor wat NIET in de ondertekende index
// hoeft te staan: welke sleutel een uitgever in `log[].erk` heeft, hoe hij
// heet, wat voor nummer hij afgeeft en waar een mens het kan opzoeken.
//
// De ondertekende index blijft de bron voor mkpErkenning en mkpControleer
// (sleutels, handtekeningen, de controleplek die een lezer toont). Deze tabel
// verandert daar niets aan.
//
// Ingevuld UITSLUITEND met wat in die twee lijsten stond (17-11-2026). Waar een
// lijst iets niet zegt, staat hier null — niet een aanname. In het bijzonder:
//   · `zoektOp` is null als geen van beide lijsten zegt waarop het register zoekt;
//   · een register dat het nummer niet toont (TloKB) is een eigen regel met
//     soort "register" en is GEEN uitgever: "tlokb:<nummer>" bestaat niet
//     (spec 4.8: de uitgever is wie het nummer afgeeft, niet wie een register
//     bijhoudt).
//
// Velden per regel:
//   id        de sleutel vóór de dubbele punt in log[].erk (bij een register: zijn eigen id)
//   naam      zoals in de bronlijst
//   soort     "erkenning" · "certificaat" · "register"
//   domein    domein van de uitgever, als een bronlijst het noemt; anders null
//   opzoek    adres waar een mens kan zoeken; "{nummer}" wordt door het nummer
//             vervangen als het erin staat; null als geen bronlijst er een noemt
//   zoektOp   "nummer" · "bedrijfsnaam of KVK" · null (niet bekend)
//   register  id van de regel (soort "register") waar dit nummer wordt opgezocht,
//             als dat een ander is dan de uitgever zelf; anders null
//   demo      true alleen voor de demo-uitgever van de standaard
//   bron      uit welke lijst(en) de regel komt: "index", "veldapp"
// ─────────────────────────────────────────────────────────────────────────────

export const MKP_REGISTERS = Object.freeze([
  Object.freeze({
    id: "installq",
    naam: "InstallQ",
    soort: "erkenning",
    domein: "installq.nl",
    opzoek: "https://www.echteinstallateur.nl/",
    zoektOp: null,
    register: null,
    demo: false,
    bron: Object.freeze(["index", "veldapp"]),
  }),
  Object.freeze({
    id: "kiwa",
    naam: "Kiwa",
    soort: "certificaat",
    domein: null,
    opzoek: null,
    zoektOp: null,
    register: "tlokb",
    demo: false,
    bron: Object.freeze(["veldapp"]),
  }),
  Object.freeze({
    id: "tlokb",
    naam: "TloKB",
    soort: "register",
    domein: null,
    opzoek: "https://register.tlokb.nl/co/certificaathouder",
    zoektOp: "bedrijfsnaam of KVK",
    register: null,
    demo: false,
    bron: Object.freeze(["veldapp"]),
  }),
  Object.freeze({
    id: "demo",
    naam: "Demo-uitgever (in de praktijk: de erkennende instantie)",
    soort: "erkenning",
    domein: "meterkastpaspoort.nl",
    opzoek: "https://meterkastpaspoort.nl/v.html?erk={nummer}",
    zoektOp: "nummer",
    register: null,
    demo: true,
    bron: Object.freeze(["index"]),
  }),
]);

// Bij een erk-waarde ("kiwa:K0213477") de regel van de uitgever, en de regel van
// het register waar het nummer wordt opgezocht (bij een uitgever met een eigen
// opzoekplek: dezelfde regel). Maakt geen tekst voor een gebruiker.
//
// Uiteenleggen gaat zoals mkpErkenning dat doet (eerste dubbele punt, beide
// delen niet leeg) en de uitgever wordt EXACT vergeleken, zoals daar ook.
// Geeft null bij een ongeldige waarde; bij een onbekende uitgever, of een id
// dat een register is en geen uitgever, is `regel` null.
export function mkpRegister(erk, tabel = MKP_REGISTERS) {
  const s = typeof erk === "string" ? erk : "";
  const i = s.indexOf(":");
  if (i <= 0 || i === s.length - 1) return null;
  const uitgever = s.slice(0, i), nummer = s.slice(i + 1);
  const rijen = Array.isArray(tabel) ? tabel : [];
  const regel = rijen.find((r) => r && r.id === uitgever && r.soort !== "register") || null;
  let register = null;
  if (regel) {
    register = regel.register
      ? (rijen.find((r) => r && r.id === regel.register) || null)
      : (regel.opzoek ? regel : null);
  }
  return { uitgever, nummer, regel, register };
}
