// De meterkastpaspoort-lezer — het groepenoverzicht op A4, voor in het kastdeurtje.
// Wordt pas geladen als iemand hem opvraagt. Afdrukken en "opslaan als pdf" gaan
// via de printdialoog van de browser; er zit geen pdf-bibliotheek in.
//
// ⚓ ZELFDE VEL ALS IN YOURWKB EN KASTSCAN (besluit Martin 25-11-2026): dezelfde
// opbouw en opmaak als het groepenoverzicht dat die apps afdrukken — kop met
// adres, gegevenskaart met de QR, eindgroepen, aardlekschakelaars, voetregel, en
// op een eigen pagina de uitknipbare sticker met de reservekopie. Eigen code: de
// lezer importeert niets uit een app.
//
// Twee dingen staan er bewust anders op, omdat de lezer alleen weergeeft wat op
// de sticker staat:
//   1. De zin "Opgesteld uit het meterkastpaspoort van … Controleer of dit klopt
//      met de kast." staat er altijd, bovenaan, en is niet uit te zetten. Een
//      afgedrukt vel ziet er gezaghebbend uit; het is een weergave, geen vaststelling.
//   2. Geen aandachtspunten en geen fasebalans: dat zijn oordelen (YourWkb geeft
//      ze hier ook niet mee).
// De kolom Aardlek komt uit de sticker (blokversie 2, veld `al`); staat het er
// niet, dan "—" en een regel om het met de hand in te vullen. Nooit uit de plaats.

import { maakQr } from "./vendor/qrcode.min.js";
import { groepenVerklaring } from "./model.js";

const SVG = "http://www.w3.org/2000/svg";

/** De QR als SVG: één pad met een vierkantje per donkere module, met 4 modules stilte eromheen. */
export function qrSvg(tekst) {
  const qr = maakQr(tekst, "M");
  const n = qr.modules.size, rand = 4, d = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) d.push(`M${x + rand} ${y + rand}h1v1h-1z`);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${n + 2 * rand} ${n + 2 * rand}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR-code meterkastpaspoort");
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

// Dezelfde kleuren als het vel van YourWkb en Kastscan (aardlekcodes A1–A4, fasen L1–L3).
const AARDLEK_KLEUR = { A1: "#8FC4E8", A2: "#A3D39C", A3: "#F3BE8A", A4: "#F0DC8C", EIGEN: "#C3A9D8" };
const FASE_KLEUR = { L1: "#2196F3", L2: "#9B59B6", L3: "#14B8A6" };
const aardlekCode = (n) => (n >= 1 && n <= 4 ? `A${n}` : "EIGEN");

// Zwart op wit, millimeters. Overgenomen van het groepenoverzicht van YourWkb;
// alles onder .vel, zodat het de lezer zelf niet raakt.
const CSS = `
@page{size:A4;margin:12mm}
.vel{background:#fff;color:#000;width:210mm;box-sizing:border-box;margin:0 auto;padding:12mm;border-radius:6px;
  font-family:'Barlow Condensed','Arial Narrow','Roboto Condensed',sans-serif;font-size:10pt;line-height:1.35;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.vel *,.vel *::before,.vel *::after{box-sizing:border-box;margin:0;padding:0}
.vel .merknaam{font-weight:800;letter-spacing:-0.02em;font-size:15pt;line-height:1;color:#111318;margin-bottom:2mm}
.vel .kop{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.2mm solid #000;padding-bottom:3mm;margin-bottom:5mm;position:relative}
.vel .kop::after{content:"";position:absolute;left:0;bottom:-1.2mm;width:28mm;height:1.2mm;background:#F5C518}
.vel h1{font-size:20pt;font-weight:700;letter-spacing:-0.01em;line-height:1.05}
.vel .sub{font-size:10pt;font-weight:500;margin-top:1mm;color:#000}
.vel .rechts{text-align:right;font-size:9pt;font-weight:500}
.vel .controle{border:0.4mm solid #000;padding:2mm 3mm;font-size:10pt;font-weight:700;margin:0 0 5mm}
.vel .blok{margin-bottom:6mm}
.vel h2,.vel h3{break-after:avoid;page-break-after:avoid}
.vel thead{display:table-header-group}
.vel tr{break-inside:avoid;page-break-inside:avoid}
.vel .kaart,.vel .voet{break-inside:avoid;page-break-inside:avoid}
.vel h2{font-size:13pt;font-weight:700;margin-bottom:2mm;padding-bottom:1mm;border-bottom:0.4mm solid #000;position:relative}
.vel h2::after{content:"";position:absolute;left:0;bottom:-0.4mm;width:18mm;height:0.8mm;background:#F5C518}
.vel h3{font-size:10pt;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:4mm 0 1.5mm}
.vel table{width:100%;border-collapse:collapse;font-size:9.5pt}
.vel th{text-align:left;font-weight:700;font-size:8pt;letter-spacing:0.06em;text-transform:uppercase;border-bottom:0.4mm solid #000;padding:1.2mm 1.5mm}
.vel td{padding:1.2mm 1.5mm;border-bottom:0.2mm solid #999;font-variant-numeric:tabular-nums}
.vel td.naam{font-weight:600}
.vel .leeg{color:#666;font-style:italic;font-weight:400}
.vel .chip,.vel .fase{display:inline-flex;align-items:center;gap:1.2mm;font-weight:700;white-space:nowrap}
.vel .stip{display:inline-block;width:2.4mm;height:2.4mm;border-radius:50%;border:0.2mm solid #000}
.vel .stippen{display:inline-flex;gap:0.6mm}
.vel .stippen i{display:inline-block;width:1.4mm;height:1.4mm;border-radius:50%;background:#000}
.vel .faseblok{display:inline-block;width:2.2mm;height:2.2mm;border:0.2mm solid #000}
.vel .kaart{border:0.4mm solid #000;padding:3mm;margin-bottom:3mm}
.vel .rij{display:flex;gap:4mm;flex-wrap:wrap}
.vel .rij>div{flex:1 1 34mm}
.vel .klein{font-size:8pt;font-weight:600;letter-spacing:0.06em;text-transform:uppercase}
.vel .groot{font-size:14pt;font-weight:700;font-variant-numeric:tabular-nums}
.vel .kaart-qr{display:flex;gap:4mm;align-items:stretch}
.vel .kaart-qr>.rij{flex:1 1 auto;align-content:center}
.vel .kaart-qr>.rij>div{flex:1 1 22mm}
.vel .kaart-qr>.rij>div:last-child{flex:2 1 46mm}
.vel .paspoort{flex:0 0 27mm;text-align:center;border-left:0.4mm solid #000;padding-left:4mm}
.vel .paspoort svg{width:26mm;height:26mm;display:block;margin:0 auto 1mm}
.vel .micro{font-size:7pt;color:#444;margin-top:0.4mm}
.vel .regel{margin-top:2mm;font-size:9pt}
.vel .voet{margin-top:6mm;padding-top:2mm;border-top:0.4mm solid #000;font-size:8pt;line-height:1.4}
.vel .stickerpagina{break-before:page;page-break-before:always;padding-top:6mm}
.vel .sticker{border:0.6mm dashed #777;border-radius:3mm;width:72mm;padding:0 0 4mm;text-align:center;margin:6mm auto 0;overflow:hidden}
.vel .sticker .band{background:#F5C518;height:3mm}
.vel .sticker .binnen{padding:3mm 4mm 0}
.vel .sticker svg{width:52mm;height:52mm;display:block;margin:2mm auto}
.vel .sticker .merk{font-weight:700;font-size:11pt;letter-spacing:0.04em}
.vel .sticker .adres{font-size:9pt;font-weight:600;margin-top:0.8mm}
.vel .sticker .klein{font-size:7.5pt;color:#444;margin-top:1mm;line-height:1.35;font-weight:500;letter-spacing:0;text-transform:none}
.vel .stickerpagina .uitleg{max-width:120mm;font-size:9pt;line-height:1.45}
.vel .stickerpagina .reserve{max-width:120mm;margin:8mm auto 0;padding:3mm;border:0.4mm solid #000;font-size:8.5pt;line-height:1.45}
@media print{
  html,body{background:#fff !important}
  .wrap{padding:0;max-width:none}
  .wrap > :not(#afdruk), #stil, .afdrukbalk{display:none !important}
  .vel{padding:0;width:auto;border-radius:0;zoom:1 !important}
}`;

/**
 * Bouwt het vel in #afdruk en zet de pagina in de afdrukstand.
 * @param {{ el, m, p, h, frag, status, terug }} o — `el` is de elementbouwer van de
 *   lezer (alles als tekst), `p` het paspoort, `status` de handtekeningstatus van de laatste regel.
 */
export function toonVerklaring({ el, m, p = {}, h, frag, status, terug }) {
  const plek = document.getElementById("afdruk");
  const v = groepenVerklaring(m);
  const laatste = h[0] || null;
  const datum = m.bijgewerkt || (laatste && laatste.datum) || "onbekende datum";
  const url = `https://meterkastpaspoort.nl/p#${frag}`;
  const leeg = (t) => el("span", { class: "leeg" }, t);

  // Aardlekschakelaars in leesvolgorde: A1, A2 … (zoals op het vel van de apps).
  const items = m.rails.flatMap((r) => r.items);
  const aardlekken = items.filter((it) => it.soort === "aardlek");
  const codeVan = new Map(aardlekken.map((it, k) => [it.i, aardlekCode(k + 1)]));
  const codeVanLetter = (l) => aardlekCode(l.charCodeAt(0) - 64);
  const chip = (code, metStippen) => {
    const n = /^A(\d)$/.test(code) ? Number(code.slice(1)) : 0;
    return el("span", { class: "chip" }, el("span", { class: "stip", style: `background:${AARDLEK_KLEUR[code] || "#546E7A"}` }), code,
      metStippen && n ? el("span", { class: "stippen" }, ...Array.from({ length: n }, () => el("i"))) : null);
  };
  const faseChip = (fn) => {
    if (!Array.isArray(fn) || !fn.length) return leeg("invullen");
    if (fn.length > 1) return el("span", { class: "fase" }, fn.map((f) => `L${f}`).join("+"));
    const f = `L${fn[0]}`;
    return el("span", { class: "fase" }, el("span", { class: "faseblok", style: `background:${FASE_KLEUR[f] || "#fff"}` }), f);
  };

  // Eindgroepen: in de volgorde van de kast als de tekening de groepen kent, anders in de volgorde van de sticker.
  const grp = Array.isArray(p.grp) ? p.grp : [];
  const itemVan = new Map(items.filter((it) => it.groep).map((it) => [it.groep, it]));
  const volgorde = v.gekoppeld
    ? [...new Set([...items.filter((it) => it.groep).map((it) => it.groep), ...v.regels.map((r) => r.nr)])]
    : v.regels.map((r) => r.nr);
  const rijen = volgorde.map((nr) => {
    const r = v.regels[nr - 1], it = itemVan.get(nr), g = grp[nr - 1] || {};
    return el("tr", {},
      el("td", { style: "width:8mm;font-weight:700" }, String(nr)),
      el("td", { class: "naam" }, g.n ? r.naam : leeg(r.naam || `Groep ${nr}`)),
      el("td", { style: "width:16mm" }, r.stroom || leeg("invullen")),
      el("td", { style: "width:20mm" }, faseChip(g.fn)),
      el("td", { style: "width:18mm" }, /^[A-Z]$/.test(r.aardlek) ? chip(codeVanLetter(r.aardlek), false) : leeg("—")),
      el("td", { style: "width:14mm" }, it ? `${it.breedte}M` : ""),
      el("td", {}, ""));
  });
  const aardlekRijen = aardlekken.map((it, k) => {
    const delen = it.bev.split(" · ");
    const ma = delen.find((d) => /mA$/.test(d)), type = delen.find((d) => /^type /.test(d));
    return el("tr", {},
      el("td", { style: "width:22mm" }, chip(codeVan.get(it.i), true)),
      el("td", { class: "naam" }, it.naam || `RCD ${k + 1}`),
      el("td", { style: "width:20mm" }, ma || leeg("invullen")),
      el("td", { style: "width:18mm" }, type || leeg("invullen")),
      el("td", { style: "width:16mm" }, it.polen ? `${it.polen}-polig` : "—"),
      el("td", {}, (() => {
        const g = items.filter((x) => x.achter === it.letter && x.groep).map((x) => x.groep);
        return g.length ? `groep ${g.join(", ")}` : "—";
      })()));
  });
  const ala = items.filter((it) => it.soort === "aardlekautomaat" && it.groep).map((it) => it.groep);

  const ha = p.ha || {};
  const veld = (kop, waarde, klein) => el("div", {}, el("div", { class: "klein" }, kop), el("div", { class: "groot", style: klein ? "font-size:10pt" : null }, waarde));
  const kaartQr = qrSvg(url);
  const stickerQr = qrSvg(url);

  const herkomst = laatste ? [
    el("div", {}, el("strong", {}, laatste.bedrijf || "Onbekend bedrijf")),
    laatste.erkenning ? el("div", {}, `${laatste.erkenning.naam} ${laatste.erkenning.nummer}`) : el("div", {}, "geen erkenning vermeld"),
    el("div", {}, STATUS_TEKST[status] || STATUS_TEKST.geen),
  ] : [el("div", {}, "geen logboek op de sticker")];

  const vel = el("article", { class: "vel" },
    el("div", { class: "kop" },
      el("div", {},
        el("div", { class: "merknaam" }, "Meterkastpaspoort"),
        el("h1", {}, "Groepenoverzicht"),
        el("div", { class: "sub" }, m.adres || "—")),
      el("div", { class: "rechts" }, ...herkomst, el("div", {}, datum), el("div", {}, "meterkastpaspoort.nl/lezer"))),
    el("div", { class: "controle" }, `Opgesteld uit het meterkastpaspoort van ${datum}. Controleer of dit klopt met de kast.`),
    el("div", { class: "blok" },
      el("h2", {}, m.kast || "Verdeelinrichting"),
      el("div", { class: "kaart kaart-qr" },
        el("div", { class: "rij" },
          veld("Aansluiting", ha.a ? `${ha.f === 1 ? "1" : "3"} × ${ha.a} A` : "—"),
          veld("Stelsel", p.stl || "—"),
          veld("Kamrail", p.kam && p.kam.mm2 ? el("span", {}, `${p.kam.mm2} mm`, el("sup", {}, "2")) : "—"),
          veld("Omvang", `${v.regels.length} groep${v.regels.length === 1 ? "" : "en"}${aardlekken.length ? ` · ${aardlekken.length} aardlekschakelaar${aardlekken.length === 1 ? "" : "s"}` : ""}`, true)),
        el("div", { class: "paspoort" }, kaartQr.svg, el("div", { class: "klein" }, "Meterkastpaspoort"), el("div", { class: "micro" }, "scan met de camera"))),
      el("h3", {}, "Eindgroepen"),
      el("table", {},
        el("thead", {}, el("tr", {}, ...["Nr", "Naam", "Beveiliging", "Fase", "Aardlek", "Breedte", "Type"].map((t) => el("th", {}, t)))),
        el("tbody", {}, ...(rijen.length ? rijen : [el("tr", {}, el("td", { colspan: "7", class: "leeg" }, "Geen groepen op de sticker."))]))),
      el("h3", {}, "Aardlekschakelaars"),
      el("table", {},
        el("thead", {}, el("tr", {}, ...["Code", "Naam", "IΔn", "Type", "Polen", "Beveiligt"].map((t) => el("th", {}, t)))),
        el("tbody", {}, ...(aardlekRijen.length ? aardlekRijen : [el("tr", {}, el("td", { colspan: "6", class: "leeg" }, m.rails.length ? "Geen aardlekschakelaars." : "Niet op de sticker."))]))),
      ala.length ? el("div", { class: "regel" }, el("strong", {}, "Eigen aardlekbeveiliging: "), `groep ${ala.join(", ")} — aardlekautomaten, elk met een eigen aanspreekstroom.`) : null,
      v.metAardlek ? null : el("div", { class: "regel" }, "Achter welke aardlekschakelaar een groep hangt, staat niet (voor elke groep) op de sticker. Vul het in de kolom Aardlek met de hand in."),
      m.ontbreekt.length ? el("div", { class: "regel" }, m.ontbreekt.join(" ")) : null),
    el("div", { class: "voet" },
      "Dit overzicht is opgesteld met de lezer van de open standaard Meterkastpaspoort, uit wat de laatste installateur op de sticker heeft vastgelegd. ",
      "Het beoordeelt de installatie niet; wat niet op de sticker staat, staat leeg en is niet geraden.",
      el("br"), "Dit document is de samenvattende groepenverklaring bij deze verdeelinrichting (NEN 1010, rubriek 514)."),
    el("div", { class: "stickerpagina" },
      el("h2", {}, "Meterkastpaspoort — sticker voor op de kastdeur"),
      el("p", { class: "uitleg" }, "Knip de sticker uit langs de stippellijn en plak hem aan de ", el("strong", {}, "binnenzijde van de meterkastdeur"),
        ". Elke volgende installateur scant de code met de telefooncamera en ziet direct wat er op deze kast hangt: de indeling, de faseverdeling en het logboek.",
        el("br"), el("br"), "De gegevens zitten ", el("strong", {}, "in de code zelf"),
        " — er is geen centrale opslag. De sticker werkt daarom ook in een kelder zonder bereik, en er is nergens een database met adressen. Open standaard: meterkastpaspoort.nl."),
      el("div", { class: "sticker" }, el("div", { class: "band" }),
        el("div", { class: "binnen" },
          el("div", { class: "merk" }, "⚡ METERKASTPASPOORT"),
          m.adres ? el("div", { class: "adres" }, m.adres) : null,
          stickerQr.svg,
          el("div", { class: "klein" }, `Scan met je telefooncamera · bijgewerkt ${datum}`),
          el("div", { class: "klein" }, "meterkastpaspoort.nl — open standaard"))),
      el("div", { class: "reserve" }, el("strong", {}, "Dit overzicht is tevens de reservekopie van het paspoort."),
        " Sticker kwijt, beschadigd of verloren gegaan — bijvoorbeeld door brand? Scan de code hierboven uit dit document en print hem opnieuw. Elk uitgedraaid overzicht bevat de paspoortstand van dat moment, dus de historie is zo vaak bewaard als er overzichten zijn.")));

  const stijl = document.createElement("style");
  stijl.textContent = CSS;
  document.head.append(stijl);
  plek.replaceChildren(
    el("div", { class: "afdrukbalk knoppen" },
      el("button", { class: "hoofd", type: "button", onclick: () => window.print() }, "Afdrukken of opslaan als pdf"),
      el("button", { type: "button", onclick: sluit }, "Terug")),
    el("p", { class: "zacht klein afdrukbalk" }, "Kies in het printvenster je printer, of \"Opslaan als pdf\". Op A4, staand."),
    vel);
  plek.hidden = false;
  document.body.classList.add("verklaring");
  window.scrollTo(0, 0);
  // Op het scherm het hele vel in beeld; op papier geldt zoom 1.
  const pas = () => { vel.style.zoom = ""; const z = Math.min(1, plek.clientWidth / vel.offsetWidth); vel.style.zoom = z < 1 ? String(Math.floor(z * 100) / 100) : ""; };
  pas(); window.addEventListener("resize", pas);

  function sluit() {
    window.removeEventListener("resize", pas);
    stijl.remove();
    plek.hidden = true; plek.replaceChildren();
    document.body.classList.remove("verklaring");
    if (terug) terug();
  }
  return { qrModules: kaartQr.modules };
}
