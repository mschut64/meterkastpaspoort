// De meterkastpaspoort-lezer — de groepenverklaring op A4, voor in het kastdeurtje.
// Wordt pas geladen als iemand hem opvraagt. Afdrukken en "opslaan als pdf" gaan
// via de printdialoog van de browser; er zit geen pdf-bibliotheek in.
//
// Het vel is een WEERGAVE van een verklaring, geen vaststelling. Daarom staat de
// zin "Opgesteld uit het meterkastpaspoort van … Controleer of dit klopt met de
// kast." er altijd op, bovenaan, en is hij niet uit te zetten.

import { maakQr } from "./vendor/qrcode.min.js";
import { groepenVerklaring, SOORT_NAAM } from "./model.js";

const SVG = "http://www.w3.org/2000/svg";
const QR_MM = 46;   // zo groot als het bedrukbare deel van een sticker van 50 mm

/** De QR als SVG: één pad met een vierkantje per donkere module, met 4 modules stilte eromheen. */
export function qrSvg(tekst) {
  const qr = maakQr(tekst, "M");
  const n = qr.modules.size, rand = 4, d = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) d.push(`M${x + rand} ${y + rand}h1v1h-1z`);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${n + 2 * rand} ${n + 2 * rand}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR-code van dit meterkastpaspoort");
  const achter = document.createElementNS(SVG, "rect");
  achter.setAttribute("width", "100%"); achter.setAttribute("height", "100%"); achter.setAttribute("fill", "#fff");
  const pad = document.createElementNS(SVG, "path");
  pad.setAttribute("d", d.join("")); pad.setAttribute("fill", "#000");
  svg.append(achter, pad);
  return { svg, modules: n };
}

const STATUS_TEKST = {
  geldig: "ondertekend en geverifieerd", onbekend: "ondertekend, nog niet te verifiëren",
  ongeldig: "handtekening komt niet overeen", geen: "niet ondertekend",
};

/**
 * Bouwt het vel in `plek` en zet de pagina in de afdrukstand.
 * @param {{ el, m, h, frag, status, terug }} o — `el` is de elementbouwer van de
 *   lezer (alles als tekst), `status` de handtekeningstatus van de laatste regel.
 */
export function toonVerklaring({ el, m, h, frag, status, terug }) {
  const plek = document.getElementById("afdruk");
  const v = groepenVerklaring(m);
  const laatste = h[0] || null;
  const datum = m.bijgewerkt || (laatste && laatste.datum) || "onbekende datum";

  // De tekening op papier: millimeters, lichte vlakken, geen zwarte vlakken.
  const breedst = Math.max(m.mpr || 0, ...m.rails.map((r) => r.breedte), 1);
  const modMm = Math.min(10, Math.floor((186 - 8) / breedst * 10) / 10);
  const tekening = m.rails.length ? el("div", { class: "p-kast" }, ...m.rails.map((r) => el("div", { class: "p-rail" },
    el("span", { class: "p-railnr" }, String(r.nr)),
    ...r.items.map((it) => el("div", {
      class: `p-mod p-${it.soort}${it.leeg ? " p-leeg" : ""}`, style: `width:${(it.breedte * modMm).toFixed(1)}mm`,
      title: SOORT_NAAM[it.soort] || it.soort,
    }, it.kort ? el("span", { class: "p-k" }, it.kort) : null,
      it.bev && modMm * it.breedte >= 7 ? el("span", { class: "p-b" }, it.bev.split(" · ")[0]) : null,
      it.groep ? el("span", { class: "p-g" }, String(it.groep)) : null))))) : null;

  const qr = qrSvg(`https://meterkastpaspoort.nl/p#${frag}`);
  qr.svg.setAttribute("style", `width:${QR_MM}mm;height:${QR_MM}mm;display:block`);

  const herkomstRegels = laatste ? [
    el("div", {}, el("b", {}, laatste.bedrijf || "Onbekend bedrijf"), laatste.datum ? ` · ${laatste.datum}` : ""),
    laatste.erkenning ? el("div", {}, `${laatste.erkenning.naam} ${laatste.erkenning.nummer}${laatste.erkenning.register ? ` (register ${laatste.erkenning.register})` : ""}`) : el("div", {}, "Geen erkenning vermeld."),
    el("div", {}, STATUS_TEKST[status] || STATUS_TEKST.geen),
  ] : [el("div", {}, "Geen logboek op de sticker: niet te zien wie dit heeft vastgelegd.")];

  const tabel = el("table", { class: "p-tabel" },
    el("thead", {}, el("tr", {}, el("th", {}, "Groep"), el("th", {}, "Waarvoor"), el("th", {}, "Aardlek"), el("th", {}, "Beveiliging"), el("th", {}, "Fase"))),
    el("tbody", {}, ...v.regels.map((r) => el("tr", {},
      el("td", { class: "p-nr" }, String(r.nr)),
      el("td", {}, r.naam, r.onderverdeler ? " (voedt een onderverdeler)" : ""),
      el("td", { class: r.aardlek ? "" : "p-invul" }, r.aardlek),
      el("td", {}, r.stroom),
      el("td", {}, r.fase.replace(/^fase /, ""))))));

  const aardlekken = v.aardlekken.length
    ? el("p", { class: "p-klein" }, "Aardlekschakelaars in de kast: ", v.aardlekken.map((a) => `${a.letter}${a.bev ? ` (${a.bev})` : ""}`).join(" · "), ".")
    : null;

  const vel = el("article", { class: "vel" },
    el("div", { class: "p-kop" },
      el("div", {},
        el("div", { class: "p-titel" }, "Groepenverklaring"),
        el("div", { class: "p-adres" }, [m.adres, m.kast].filter(Boolean).join(" · ") || "Adres niet op de sticker"),
        el("div", { class: "p-zin" }, `Opgesteld uit het meterkastpaspoort van ${datum}. Controleer of dit klopt met de kast.`),
        el("div", { class: "p-herkomst" }, el("div", { class: "p-klein" }, "Vastgelegd door de laatste installateur:"), ...herkomstRegels)),
      el("div", { class: "p-qr" }, qr.svg, el("div", { class: "p-klein" }, "Het meterkastpaspoort zelf. Scan met de camera."))),
    tekening ? el("div", { class: "p-blok" }, el("div", { class: "p-kopje" }, "De kast, van links naar rechts"), tekening) : null,
    el("div", { class: "p-blok" }, el("div", { class: "p-kopje" }, "Groepen"),
      v.regels.length ? tabel : el("p", {}, "Geen groepen op de sticker."),
      aardlekken,
      el("p", { class: "p-klein" }, "Achter welke aardlekschakelaar een groep hangt, staat niet op de sticker (behalve bij een aardlekautomaat). Vul het hier met de hand in."),
      m.ontbreekt.length ? el("p", { class: "p-klein" }, m.ontbreekt.join(" ")) : null),
    el("div", { class: "p-voet" }, "Gemaakt met de lezer van de open standaard Meterkastpaspoort (meterkastpaspoort.nl/lezer). Dit vel geeft weer wat op de sticker staat; het beoordeelt de installatie niet."));

  plek.replaceChildren(
    el("div", { class: "afdrukbalk knoppen" },
      el("button", { class: "hoofd", type: "button", onclick: () => window.print() }, "Afdrukken of opslaan als pdf"),
      el("button", { type: "button", onclick: sluit }, "Terug")),
    el("p", { class: "zacht klein afdrukbalk" }, "Kies in het printvenster je printer, of \"Opslaan als pdf\". Op A4, staand."),
    vel);
  // A4 alleen zolang het vel open staat (de stroken hebben een eigen paginamaat).
  const pagina = document.createElement("style");
  pagina.textContent = "@page { size: A4; margin: 10mm; }";
  document.head.append(pagina);
  plek.hidden = false;
  document.body.classList.add("verklaring");
  window.scrollTo(0, 0);
  // Op het scherm het hele vel in beeld; op papier telt alleen @page (zoom 1).
  const pas = () => { vel.style.zoom = ""; const z = Math.min(1, plek.clientWidth / vel.offsetWidth); vel.style.zoom = z < 1 ? String(Math.floor(z * 100) / 100) : ""; };
  pas(); window.addEventListener("resize", pas);

  function sluit() {
    window.removeEventListener("resize", pas);
    pagina.remove();
    plek.hidden = true; plek.replaceChildren();
    document.body.classList.remove("verklaring");
    if (terug) terug();
  }
  return { qrModules: qr.modules };
}
