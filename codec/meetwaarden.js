// Stelsel (`stl`) en meetwaarden (`mw[]`): voorstel v0.4, besluiten 23-11-2026.
//
//   stl   het aardingsstelsel van de installatie, in de KERN. De beoordeling
//         van de lusimpedantie hangt eraan (TN en TT kennen andere
//         uitschakeltijden), en zonder stelsel moet de volgende het opnieuw
//         vaststellen. Alleen de vier waarden hieronder; een andere waarde of
//         "anders" wordt niet geschreven.
//   mw[]  de meetwaarden, alleen in profiel VOLLEDIG (het bestand bij de
//         overdracht), nooit op de sticker. Eén element per gemeten waarde:
//           s  soortcode uit MKP_MEETSOORTEN (bepaalt ook de eenheid)
//           w  de waarde als tekst, zoals gemeten (">999" en "n.m." mogen)
//           g  de plaats van de groep in grp[], vanaf 1 (weg = de kast als geheel)
//           p  het meetpunt in woorden (veldmeting, doorgangsweerstand, aardlek)
//           d  meetdatum JJJJ-MM-DD
//           c  meetconditie (isolatie: "afgekoppeld" of "aangesloten")
//         De codec toetst niets: een grens is een oordeel van de toepassing.

export const MKP_STELSELS = Object.freeze(["TN-C-S", "TN-S", "TT", "IT"]);

// Een stelsel zoals een app het noteert, in de vorm van de standaard; anders null.
export function mkpStelsel(waarde) {
  const t = String(waarde == null ? "" : waarde).trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
  const vorm = { "TNCS": "TN-C-S", "TN-C-S": "TN-C-S", "TNS": "TN-S", "TN-S": "TN-S", "TT": "TT", "IT": "IT" }[t];
  return vorm || null;
}

export const MKP_MEETSOORTEN = Object.freeze({
  "zln":      { eenheid: "Ω",  naam: "Z L-N" },
  "zlpe":     { eenheid: "Ω",  naam: "Z L-PE" },
  "zl2n":     { eenheid: "Ω",  naam: "Z L2-N" },
  "zl2pe":    { eenheid: "Ω",  naam: "Z L2-PE" },
  "zl3n":     { eenheid: "Ω",  naam: "Z L3-N" },
  "zl3pe":    { eenheid: "Ω",  naam: "Z L3-PE" },
  "zl12":     { eenheid: "Ω",  naam: "Z L1-L2" },
  "zl23":     { eenheid: "Ω",  naam: "Z L2-L3" },
  "zl31":     { eenheid: "Ω",  naam: "Z L3-L1" },
  "iso-fa":   { eenheid: "MΩ", naam: "Isolatie fase → aarde" },
  "iso-na":   { eenheid: "MΩ", naam: "Isolatie nul → aarde" },
  "iso-l1":   { eenheid: "MΩ", naam: "Isolatie L1 → aarde" },
  "iso-l2":   { eenheid: "MΩ", naam: "Isolatie L2 → aarde" },
  "iso-l3":   { eenheid: "MΩ", naam: "Isolatie L3 → aarde" },
  "rcd-t":    { eenheid: "ms", naam: "Aardlek uitschakeltijd" },
  "rcd-i":    { eenheid: "mA", naam: "Aardlek aanspreekstroom" },
  "rcd-knop": { eenheid: "",   naam: "Aardlek testknop" },
  "rlo":      { eenheid: "Ω",  naam: "Doorgangsweerstand beschermingsleiding" },
  "pe-ver":   { eenheid: "Ω",  naam: "Potentiaalvereffening" },
  "pv-aard":  { eenheid: "Ω",  naam: "Aardverbinding draagconstructie PV" },
  "pv-uac":   { eenheid: "V",  naam: "PV spanning AC" },
  "pv-zlpe":  { eenheid: "Ω",  naam: "PV Z L-PE" },
  "pv-isoac": { eenheid: "MΩ", naam: "PV isolatie AC" },
  "pv-iso":   { eenheid: "MΩ", naam: "PV isolatie string" },
  "pv-uoc":   { eenheid: "V",  naam: "PV open klemspanning string" },
  "pv-isc":   { eenheid: "A",  naam: "PV kortsluitstroom string" },
  "pv-rlo":   { eenheid: "Ω",  naam: "PV doorgangsweerstand omvormer" },
});
