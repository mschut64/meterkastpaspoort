// De EAN-18-controle van een Nederlandse aansluiting (GS1 modulo-10).
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

// EAN-18 validatie: 18 cijfers, NL begint met 87, laatste cijfer = GS1
// modulo-10-controlecijfer (afwisselend ×3/×1 vanaf rechts, aanvullen tot
// tiental). Let op: dit is dus géén elfproef (die was van oude bankrekeningen).
export const eanValide = (ean) => {
  const s = String(ean || "").replace(/\s/g, "");
  if (!/^\d{18}$/.test(s)) return false;
  if (!s.startsWith("87")) return false;
  let som = 0;
  for (let i = 0; i < 17; i++) {
    const cijfer = s.charCodeAt(16 - i) - 48; // van rechts naar links, excl. controlecijfer
    som += cijfer * (i % 2 === 0 ? 3 : 1);
  }
  const controle = (10 - (som % 10)) % 10;
  return controle === (s.charCodeAt(17) - 48);
};
