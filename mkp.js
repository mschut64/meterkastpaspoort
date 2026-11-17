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
//   codec/controleren.js  handtekening, index, erkenning, zegels, veldnotities
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
export {
  MKP_INDEX_URL, MKP_DEMO_FEED_URL, MKP_WORTEL_SLEUTEL,
  mkpZegels, mkpCanon, mkpVerifieer, mkpErkenning, mkpVeldnotities, mkpVerifieerIndex, mkpControleer,
} from "./codec/controleren.js";
export { mkpSamenvatting, mkpVerdeelinrichting, qrWaarschuwing } from "./codec/teksten.js";
