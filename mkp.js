// ─────────────────────────────────────────────────────────────────────────────
// Open Meterkastpaspoort — referentie-implementatie van het formaat
//
// Hoort bij de specificatie in index.html. Dit is de code die het formaat
// SCHRIJFT EN LEEST: coderen, decoderen, de URL, de EAN-controle, de
// samenvatting en de leesbaarheidsgrens van de QR.
//
// Een paspoort is een JSON-object conform de specificatie, gecomprimeerd met
// deflate-raw en gecodeerd als base64url in het URL-FRAGMENT achter /p#.
// Fragmenten gaan nooit naar een server: privacy door architectuur. De QR draagt
// zijn gegevens dus zelf mee en werkt in een kelder zonder bereik.
//
// WAT HIER NIET IN HOORT is de vertaling van de gegevens van één applicatie naar
// dit formaat. YourWkb gaat uit van aardlekgroepen met eindgroepen, Kastscan van
// modules op een DIN-rail; die vertaling blijft dus in de app. De standaard is
// het formaat, niet de weg ernaartoe.
//
// Gebruik in een app:
//   package.json: "meterkastpaspoort": "https://github.com/mschut64/meterkastpaspoort/archive/refs/tags/vX.Y.Z.tar.gz"
//   (een tag, geen branch: een push hier verandert de apps niet stilzwijgend)
//   import { mkpEncode, mkpDecode, eanValide } from "meterkastpaspoort";
//
// Licentie CC BY 4.0, net als de specificatie.
// ─────────────────────────────────────────────────────────────────────────────
//
// Opbouw (sinds 17-11-2026): dit bestand is de ingang en exporteert alles
// opnieuw uit codec/. Elke module doet één ding; de zin bovenaan zegt wat.
//   codec/coderen.js      lezen en schrijven: JSON ⇄ fragment, begrensd uitpakken
//   codec/ean.js          EAN-18-controle
//   codec/samenvoegen.js  hergebruik van een gescand paspoort
//   codec/qr.js           omvang van een QR en de grens
//   codec/afkappen.js     inkorten tot het op de sticker past
//   codec/profielen.js    kern / inspectie / volledig, en de maat van de sticker
//   codec/controleren.js  handtekening, index, erkenning, zegels, veldnotities
//   codec/versie.js       versieherkenning: datamodel, profiel, onbekende velden
//   codec/materiaal.js    de soortcodes van mat[] en de plaats ("R1-5") lezen en schrijven
//   codec/v04.js          versie 0.4 in de payload: datamodel 3, ind en frq
//   codec/registers.js    uitgevers van erkenningen en certificaten, en hun registers
//   codec/indeling.js     het indelingsblok (v0.4-voorstel) inpakken en uitpakken
//   codec/indeling-tabellen.js  de codetabellen van dat blok
//   codec/teksten.js      Nederlandse zinnen voor een gebruiker — hoort op
//                         termijn niet in de codec
//   codec/hulp.js         gedeelde hulpjes (niet geëxporteerd)
// Importeer altijd uit dit bestand ("meterkastpaspoort" of /mkp.js): de indeling
// van codec/ is geen afspraak en kan wijzigen.
// ─────────────────────────────────────────────────────────────────────────────

export { MKP_BASIS, MKP_SPEC_VERSIE, MKP_MAX_FRAGMENT, MKP_MAX_UITGEPAKT, mkpEncode, mkpDecode, mkpUrl } from "./codec/coderen.js";
export { eanValide } from "./codec/ean.js";
export { mkpSamenvoegen } from "./codec/samenvoegen.js";
export { QR_TEKENS_GRENS, QR_MODULES_GRENS, QR_NIVEAU, qrModules } from "./codec/qr.js";
export { mkpAfkappen } from "./codec/afkappen.js";
// De drie profielen en de maat van de sticker (voorstel v0.4, besluiten 17-11-2026).
export { MKP_PROFIELEN, MKP_PROFIEL_VELDEN, MKP_STREEF_TEKENS, mkpProfielVan, mkpProfiel, mkpGrootte } from "./codec/profielen.js";
export {
  MKP_INDEX_URL, MKP_DEMO_FEED_URL, MKP_WORTEL_SLEUTEL,
  mkpZegels, mkpCanon, mkpVerifieer, mkpErkenning, mkpVeldnotities, mkpVerifieerIndex, mkpControleer,
} from "./codec/controleren.js";
export { MKP_DATAMODELLEN, MKP_VELDEN, mkpLees, mkpOnbekendePaden } from "./codec/versie.js";
export { MKP_REGISTERS, mkpRegister } from "./codec/registers.js";
export { MKP_MAT_SOORTEN, mkpPlaatsLezen, mkpPlaatsTekst } from "./codec/materiaal.js";
// Versie 0.4 in de payload (voorstel): datamodel 3 met ind en frq.
export { MKP_V04_DATAMODEL, mkpVolgendeInspectie, mkpIndeling, mkpZetV04, mkpZonderIndeling } from "./codec/v04.js";
export { mkpSamenvatting, mkpVerdeelinrichting, qrWaarschuwing } from "./codec/teksten.js";
// Het indelingsblok (voorstel v0.4, bijgesteld) — nog niet in de QR.
export { mkpIndelingInpakken, mkpIndelingUitpakken } from "./codec/indeling.js";
export {
  INDELING_VERSIE as MKP_INDELING_VERSIE, INDELING_BITS as MKP_INDELING_BITS,
  INDELING_SOORTEN as MKP_INDELING_SOORTEN, INDELING_VELDEN as MKP_INDELING_VELDEN,
  INDELING_POLEN as MKP_INDELING_POLEN, INDELING_STROMEN as MKP_INDELING_STROMEN,
  INDELING_KARAKTERISTIEKEN as MKP_INDELING_KARAKTERISTIEKEN,
  INDELING_AANSPREEKSTROMEN as MKP_INDELING_AANSPREEKSTROMEN,
  INDELING_AARDLEKTYPEN as MKP_INDELING_AARDLEKTYPEN,
  INDELING_STATUS as MKP_INDELING_STATUS, INDELING_WARMTEROUTE as MKP_INDELING_WARMTEROUTE,
  INDELING_GROEP_MAX as MKP_INDELING_GROEP_MAX, INDELING_BREEDTE_MAX as MKP_INDELING_BREEDTE_MAX,
  INDELING_AANTAL_MAX as MKP_INDELING_AANTAL_MAX,
  INDELING_MPR_MAX as MKP_INDELING_MPR_MAX, INDELING_NAAM_MAX as MKP_INDELING_NAAM_MAX,
} from "./codec/indeling-tabellen.js";
