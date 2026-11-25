// De meterkastpaspoort-lezer — de foto van de kast naast de tekening.
// Wordt pas geladen als er een foto is. De foto blijft in het geheugen van dit
// toestel: hij wordt nergens bewaard en nergens heen gestuurd.
//
// Uitlijnen (25-11-2026, met perspectief): vier tikken — begin en eind van de twee
// langste rails, of bij één rail de vier hoeken van de rij modules. Daaruit volgt
// hoe de kast op de foto ligt, ook als die schuin is genomen; projecteerKast() legt
// de indeling van het paspoort als kaders erop. Daarna zijn de vier punten te
// verslepen en schuiven de kaders mee. Pixels zijn hier alleen om aan te wijzen;
// er wordt niets uit gemeten.

import { tikStappen, projecteerKast } from "./model.js";

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, tekst) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  if (tekst !== undefined) e.textContent = tekst;
  return e;
}

/**
 * @param {{ el, m, foto: {url,w,h}, plek: HTMLElement, opModule: (i:number)=>void }} o
 */
export function fotoUitlijnen({ el, m, foto, plek, opModule }) {
  const stappen = tikStappen(m.rails);
  let tikken = [];
  let bijstellen = false;   // na de vier tikken: punten verslepen
  let sleep = -1;           // welk punt wordt versleept

  const tekst = el("p", { class: "foto-tekst", role: "status", "aria-live": "polite" });
  const opnieuw = el("button", { type: "button", onclick: () => { tikken = []; bijstellen = false; teken(); } }, "Opnieuw uitlijnen");
  const verschuif = el("button", { type: "button", onclick: () => { bijstellen = !bijstellen; teken(); } }, "Punten verschuiven");
  const svg = svgEl("svg", { viewBox: `0 0 ${foto.w} ${foto.h}`, class: "foto-laag", preserveAspectRatio: "none" });
  const vak = el("div", { class: "fotovak" }, el("img", { src: foto.url, alt: "Foto van de kast", draggable: "false" }));
  vak.append(svg);
  plek.replaceChildren(el("h2", {}, "De foto"), tekst, vak,
    el("div", { class: "knoppen", style: "margin-top:8px" }, verschuif, opnieuw),
    el("p", { class: "zacht klein" }, "De foto blijft op dit toestel en gaat nergens heen."));

  // Een maat die op de foto leesbaar is, wat de resolutie ook is.
  const stip = Math.max(7, foto.w / 100);
  const opFoto = (e) => {
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * foto.w, y: ((e.clientY - r.top) / r.height) * foto.h };
  };
  const klaar = () => tikken.length >= stappen.length;

  svg.addEventListener("pointerdown", (e) => {
    const p = opFoto(e);
    if (klaar() && bijstellen) {
      // Het dichtstbijzijnde punt pakken, met wat speling voor een vinger.
      const r = svg.getBoundingClientRect(), schaal = foto.w / r.width;
      let beste = -1, afstand = 36 * schaal;
      tikken.forEach((t, i) => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < afstand) { afstand = d; beste = i; } });
      if (beste >= 0) { sleep = beste; svg.setPointerCapture(e.pointerId); e.preventDefault(); }
      return;
    }
    if (!klaar()) { tikken.push(p); teken(); }
  });
  svg.addEventListener("pointermove", (e) => {
    if (sleep < 0) return;
    tikken[sleep] = opFoto(e);
    teken();
  });
  const los = () => { sleep = -1; };
  svg.addEventListener("pointerup", los);
  svg.addEventListener("pointercancel", los);

  function teken() {
    svg.replaceChildren();
    if (!klaar()) {
      const s = stappen[tikken.length];
      tekst.textContent = `Tik ${tikken.length + 1} van ${stappen.length} — ${s.tekst}.`;
    } else if (bijstellen) {
      tekst.textContent = "Sleep een punt tot de kaders op de modules liggen. Klaar? Tik op Klaar.";
    } else {
      tekst.textContent = "Tik op een kader voor de module en zijn groep. Liggen de kaders niet goed? Verschuif de punten.";
    }
    // Tijdens het tikken en het verslepen scrolt de foto niet mee.
    svg.classList.toggle("richt", !klaar() || bijstellen);
    opnieuw.hidden = tikken.length === 0;
    verschuif.hidden = !klaar();
    verschuif.textContent = bijstellen ? "Klaar" : "Punten verschuiven";

    if (klaar()) {
      for (const p of projecteerKast(m.rails, tikken)) {
        if (p.leeg) continue;
        const poly = svgEl("polygon", {
          points: p.hoeken.map((h) => h.join(",")).join(" "), class: "fmod",
          "data-item": String(p.i), "data-groep": p.groep ? String(p.groep) : null,
        });
        poly.addEventListener("click", (e) => { if (bijstellen) return; e.stopPropagation(); opModule(p.i); });
        svg.append(poly);
        if (p.groep) svg.append(svgEl("text", { x: p.midden[0], y: p.midden[1], class: "flabel", "font-size": Math.max(10, p.modPx * 0.75).toFixed(0), "text-anchor": "middle", "dominant-baseline": "central" }, String(p.groep)));
      }
    }
    // De punten zelf, genummerd; bij het verschuiven groter.
    tikken.forEach((t, i) => {
      svg.append(svgEl("circle", { cx: t.x, cy: t.y, r: bijstellen ? stip * 1.6 : stip, class: "ftik" }));
      svg.append(svgEl("text", { x: t.x, y: t.y, class: "ftik-nr", "font-size": (stip * 1.3).toFixed(0), "text-anchor": "middle", "dominant-baseline": "central" }, String(i + 1)));
    });
  }
  teken();
}
