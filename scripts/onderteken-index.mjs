// ─────────────────────────────────────────────────────────────────────────────
// De index van uitgevers en sleutels ondertekenen — door de beheerder, lokaal
//
//   Eenmalig een sleutelpaar maken. De privésleutel komt BUITEN deze map, op een
//   plek die niet naar iCloud of Google Drive synchroniseert; de publieke sleutel
//   wordt meteen in mkp.js gezet (MKP_WORTEL_SLEUTEL):
//     node scripts/onderteken-index.mjs nieuwe-sleutel ~/.meterkastpaspoort/wortel.pem
//
//   Na elke wijziging van veldnotities/index.json:
//     node scripts/onderteken-index.mjs onderteken ~/.meterkastpaspoort/wortel.pem
//
// De privésleutel verlaat deze computer nooit: niet in de repo, niet in een
// chat, niet in een e-mail. Bewaar een tweede kopie offline (USB-stick in de
// kluis, of de wachtwoordmanager). Wie hem heeft, kan uitgevers toevoegen en
// daarmee elke terugroepmelding vervalsen (spec §8.4).
//
// Ondertekend wordt de index zónder "handtekening" en zónder
// "wortel_publieke_sleutel" — zoals de index van 11-09-2026 — in de canonieke
// vorm uit mkp.js (sleutels gesorteerd, geen spaties).
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkpCanon, mkpVerifieerIndex, MKP_WORTEL_SLEUTEL } from "../mkp.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(REPO, "veldnotities/index.json");
const [opdracht, pad] = process.argv.slice(2);

const stop = (tekst) => { console.error("✗ " + tekst); process.exit(1); };
const rawPubliek = (sleutel) =>
  (sleutel.type === "public" ? sleutel : crypto.createPublicKey(sleutel))
    .export({ format: "der", type: "spki" }).subarray(-32).toString("base64url");

if (!pad || !["nieuwe-sleutel", "onderteken"].includes(opdracht))
  stop("Gebruik: node scripts/onderteken-index.mjs nieuwe-sleutel|onderteken <pad-naar-privesleutel.pem>");

const bestand = path.resolve(pad.replace(/^~(?=$|\/)/, process.env.HOME || "~"));
if (bestand.startsWith(REPO + path.sep))
  stop("De privésleutel mag niet in de repo staan — kies een plek buiten " + REPO);

if (opdracht === "nieuwe-sleutel") {
  if (fs.existsSync(bestand)) stop(`${bestand} bestaat al — ik overschrijf geen sleutel.`);
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  fs.mkdirSync(path.dirname(bestand), { recursive: true });
  fs.writeFileSync(bestand, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  const pub = rawPubliek(publicKey);
  const MKP = path.join(REPO, "mkp.js");
  const bron = fs.readFileSync(MKP, "utf8");
  const regel = /export const MKP_WORTEL_SLEUTEL = "[^"]*";/;
  if (!regel.test(bron)) stop("MKP_WORTEL_SLEUTEL niet gevonden in mkp.js — publieke sleutel: " + pub);
  fs.writeFileSync(MKP, bron.replace(regel, `export const MKP_WORTEL_SLEUTEL = "${pub}";`));
  console.log(`✓ Privésleutel geschreven naar ${bestand} (alleen leesbaar voor jou).`);
  console.log(`✓ Publieke sleutel in mkp.js gezet: ${pub}`);
  console.log("  Maak nu een reservekopie van de privésleutel (USB-stick of wachtwoordmanager),");
  console.log("  en draai daarna 'onderteken' met hetzelfde pad.");
  process.exit(0);
}

// onderteken
if (!fs.existsSync(bestand)) stop(`Geen privésleutel gevonden op ${bestand}.`);
const prive = crypto.createPrivateKey(fs.readFileSync(bestand));
if (prive.asymmetricKeyType !== "ed25519") stop("Dit is geen Ed25519-sleutel.");
const pub = rawPubliek(prive);

const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const inhoud = { ...index };
delete inhoud.handtekening; delete inhoud.wortel_publieke_sleutel;
inhoud.bijgewerkt = new Date().toISOString().slice(0, 10);

const handtekening = crypto.sign(null, Buffer.from(mkpCanon(inhoud)), prive).toString("base64url");
// Volgorde als voorheen: inhoud, dan handtekening, dan de sleutel ter informatie.
const uit = { ...inhoud, handtekening, wortel_publieke_sleutel: pub };

if ((await mkpVerifieerIndex(uit, pub)) !== "geldig") stop("Controle na ondertekenen mislukt — niets weggeschreven.");
fs.writeFileSync(INDEX, JSON.stringify(uit, null, 2) + "\n");
console.log(`✓ ${path.relative(REPO, INDEX)} ondertekend (bijgewerkt ${inhoud.bijgewerkt}).`);

if (pub === MKP_WORTEL_SLEUTEL) {
  console.log("✓ Klopt met MKP_WORTEL_SLEUTEL in mkp.js — lezende apps accepteren hem.");
} else {
  console.log("! Deze sleutel is NIET de sleutel die mkp.js vastpint. Lezende apps keuren de index");
  console.log("  dan af. Zet in mkp.js:");
  console.log(`    export const MKP_WORTEL_SLEUTEL = "${pub}";`);
  console.log("  en publiceer een nieuwe pakketversie.");
}
