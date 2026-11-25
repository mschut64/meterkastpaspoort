// De meterkastpaspoort-lezer — de foto van de kast naast de tekening.
// Wordt pas geladen als er een foto is. De foto blijft in het geheugen van dit
// toestel: hij wordt nergens bewaard en nergens heen gestuurd.
//
// Uitlijnen: per rail twee tikken (begin en eind van de modules, op halve hoogte).
// Daarna legt projecteer() de indeling van het paspoort als kaders op de foto.
// Pixels zijn hier alleen om aan te wijzen; er wordt niets uit gemeten.

import { projecteer } from "./model.js";

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
  const rails = m.rails.filter((r) => r.items.length);
  const stappen = rails.flatMap((r) => [{ r, kant: "begin" }, { r, kant: "eind" }]);
  let tikken = [];

  const tekst = el("p", { class: "foto-tekst", role: "status", "aria-live": "polite" });
  const opnieuw = el("button", { type: "button", onclick: () => { tikken = []; teken(); } }, "Opnieuw uitlijnen");
  const svg = svgEl("svg", { viewBox: `0 0 ${foto.w} ${foto.h}`, class: "foto-laag", preserveAspectRatio: "none" });
  const vak = el("div", { class: "fotovak" }, el("img", { src: foto.url, alt: "Foto van de kast, gemaakt bij het scannen", draggable: "false" }));
  vak.append(svg);
  plek.replaceChildren(el("h2", {}, "De foto"), tekst, vak,
    el("div", { class: "knoppen", style: "margin-top:8px" }, opnieuw),
    el("p", { class: "zacht klein" }, "De foto blijft op dit toestel en gaat nergens heen."));

  svg.addEventListener("click", (e) => {
    if (tikken.length >= stappen.length) return;        // klaar: de kaders vangen de tik zelf
    const r = svg.getBoundingClientRect();
    tikken.push({ x: ((e.clientX - r.left) / r.width) * foto.w, y: ((e.clientY - r.top) / r.height) * foto.h });
    teken();
  });

  // Een maat die op de foto leesbaar is, wat de resolutie ook is.
  const stip = Math.max(6, foto.w / 120);

  function teken() {
    svg.replaceChildren();
    const klaar = tikken.length >= stappen.length;
    if (!klaar) {
      const s = stappen[tikken.length];
      const welke = rails.length > 1 ? `rail ${s.r.nr} (van ${rails.length})` : "de rail";
      tekst.textContent = s.kant === "begin"
        ? `Tik op ${welke}: de linkerrand van de eerste module, op halve hoogte.`
        : `Tik op ${welke}: de rechterrand van de laatste module, op halve hoogte.`;
      svg.classList.add("richt");
    } else {
      tekst.textContent = "Tik op een kader voor de module en zijn groep. Liggen de kaders scheef? Lijn opnieuw uit.";
      svg.classList.remove("richt");
    }
    opnieuw.hidden = tikken.length === 0;

    // Kaders van de rails die al twee tikken hebben.
    rails.forEach((r, k) => {
      const a = tikken[2 * k], b = tikken[2 * k + 1];
      if (!a || !b) return;
      const mod = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, r.breedte);
      for (const p of projecteer(r, a, b)) {
        if (p.leeg) continue;
        const poly = svgEl("polygon", {
          points: p.hoeken.map((h) => h.join(",")).join(" "), class: "fmod",
          "data-item": String(p.i), "data-groep": p.groep ? String(p.groep) : null,
        });
        poly.addEventListener("click", (e) => { e.stopPropagation(); opModule(p.i); });
        svg.append(poly);
        if (p.groep) svg.append(svgEl("text", { x: p.midden[0], y: p.midden[1], class: "flabel", "font-size": Math.max(10, mod * 0.75).toFixed(0), "text-anchor": "middle", "dominant-baseline": "central" }, String(p.groep)));
      }
    });
    // De tikken zelf.
    for (const t of tikken) svg.append(svgEl("circle", { cx: t.x, cy: t.y, r: stip, class: "ftik" }));
  }
  teken();
}
