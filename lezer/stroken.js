// De meterkastpaspoort-lezer — labelstroken van 70 × 40 mm, liggend, vier
// DIN-modules (4 × 17,5 mm) per strook. Pas geladen als iemand ze opvraagt.
// Afdrukken via de printdialoog: elke strook is één pagina van 70 × 40 mm, zodat
// een labelprinter hem als één label krijgt en "opslaan als pdf" een vel per strook geeft.
//
// Geen zwarte vlakken (een thermische printer smeert ze, en ze kosten lint): alleen
// tekst en dunne lijnen. Tekst niet kleiner dan 10 pt, zoals in het labelsysteem.

import { labelStroken } from "./model.js";

const MODULE_MM = 17.5, BREEDTE_MM = 70, HOOGTE_MM = 40, PER_STROOK = 4;

/** Bouwt de voorvertoning in #afdruk en zet de pagina in de afdrukstand voor stroken. */
export function toonStroken({ el, m, terug }) {
  const plek = document.getElementById("afdruk");
  const stroken = labelStroken(m, PER_STROOK);

  // De paginamaat geldt alleen zolang de stroken open staan.
  const pagina = document.createElement("style");
  pagina.textContent = `@page { size: ${BREEDTE_MM}mm ${HOOGTE_MM}mm; margin: 0; }`;
  document.head.append(pagina);

  const kaarten = stroken.map((s, n) => {
    // Een toestel breder dan vier modules krijgt een strook alleen; die schaalt mee in 70 mm.
    const schaal = Math.min(1, BREEDTE_MM / (s.modules * MODULE_MM));
    const strook = el("div", { class: "strook" }, ...s.posities.map((p) => el("div", {
      class: `s-pos${p.leeg ? " s-leeg" : ""}`, style: `width:${(p.breedte * MODULE_MM * schaal).toFixed(2)}mm`,
    }, p.leeg ? null : [
      el("div", { class: "s-nr" }, p.groep ? String(p.groep) : (p.kort || "")),
      p.naam ? el("div", { class: "s-naam" }, p.naam) : el("div", { class: "s-naam" }),
      p.bev ? el("div", { class: "s-bev" }, p.bev) : null,
    ])));
    const vink = el("input", { type: "checkbox", checked: true, onchange: () => kaart.classList.toggle("niet", !vink.checked) });
    const kaart = el("div", { class: "strookkaart" },
      el("label", { class: "s-kop afdrukbalk" }, vink, ` Strook ${n + 1} · rail ${s.rail} · vanaf module ${s.vanaf + 1}`),
      strook);
    return kaart;
  });

  plek.replaceChildren(
    el("div", { class: "afdrukbalk knoppen" },
      el("button", { class: "hoofd", type: "button", onclick: () => window.print() }, "Afdrukken of opslaan als pdf"),
      el("button", { type: "button", onclick: sluit }, "Terug")),
    el("p", { class: "zacht klein afdrukbalk" },
      `${stroken.length} stroken van 70 × 40 mm, liggend, in de volgorde van de kast. Vink uit wat je niet nodig hebt. `,
      "Elke strook is één pagina: kies in het printvenster je labelprinter, of \"Opslaan als pdf\". Controleer of de tekst klopt met de kast."),
    stroken.length ? el("div", { class: "stroken" }, ...kaarten) : el("p", {}, "Deze sticker draagt geen indeling: er zijn geen stroken te maken."));
  plek.hidden = false;
  document.body.classList.add("verklaring", "stroken-open");
  window.scrollTo(0, 0);

  function sluit() {
    pagina.remove();
    plek.hidden = true; plek.replaceChildren();
    document.body.classList.remove("verklaring", "stroken-open");
    if (terug) terug();
  }
  return { aantal: stroken.length };
}
