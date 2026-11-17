// De omvang van een QR: hoeveel modules een URL kost, en waar de grens ligt.
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

// Een QR die te veel tekens draagt wordt in de praktijk niet meer gelezen van
// een sticker op een kastdeur. Boven deze grens waarschuwen we, in plaats van
// stilletjes een onleesbare code af te drukken.
export const QR_TEKENS_GRENS = 1200;

// ─── Omvang van de QR-code: grens en afkapvolgorde (hoofdstuk 6) ─────────────
//
// De begrenzing zit niet in de QR maar in de sticker. Op 50 mm met 2 mm marge
// is 46 mm bedrukbaar; bij 203 dpi wordt een module onder ~3,5 punten
// onbetrouwbaar. Richtlijn: onder de 105 modules blijven.
export const QR_MODULES_GRENS = 105;
export const QR_NIVEAU = "M";

// Bytecapaciteit per QR-versie 1–40 op foutcorrectieniveau M, bytemodus
// (ISO/IEC 18004). Afgeleid uit de qrcode-bibliotheek en getoetst aan de
// meettabel in hoofdstuk 6: URL's van 517, 570, 670, 731 en 858 tekens geven
// daar 89, 93, 101, 105 en 113 modules — deze tabel ook. Op niveau L of Q klopt
// die tabel niet, dus M is het niveau waarop de grens van 105 gemeten is.
// Zuivere bytemodus is de veilige kant: een encoder die modi mengt komt
// hooguit kleiner uit, nooit groter.
const _BYTES_M = [14,26,42,62,84,106,122,152,180,213,251,287,331,362,412,450,504,560,624,666,
                  711,779,857,911,997,1059,1125,1190,1264,1370,1452,1538,1628,1722,1809,1911,1989,2099,2213,2331];

// Aantal modules (zijde van het vierkant) voor een URL van zoveel tekens.
export function qrModules(tekens) {
  const v = _BYTES_M.findIndex((cap) => cap >= tekens);
  return v < 0 ? Infinity : 17 + 4 * (v + 1);
}
