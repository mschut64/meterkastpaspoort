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

import { tikStappen, projecteerKast, tikkenUitAi, verschilMetFoto } from "./model.js";

// De motor op yourwkb.nl (besluit Martin 25-11-2026). Alleen als de gebruiker er
// zelf voor kiest; zonder die tik gaat er niets van deze foto weg.
const AI_URL = location.hostname === "localhost" ? "http://localhost:3010/api/lezer/kastbeeld" : "https://yourwkb.nl/api/lezer/kastbeeld";
const AI_MAX_PX = 2400;      // genoeg om de opdruk te lezen, en onder de 4 MB van de route

// Twee versies van de foto. Voor de kastscan de foto zelf (verkleind tot AI_MAX_PX),
// want die moet de opdruk lezen. Voor de rails een VIERKANTE versie, met de foto in
// het midden op zwart: het model geeft zijn hoeken alsof de foto vierkant is. Op een
// staande foto van 1800 × 2400 lag elke rail daardoor een derde te laag (gemeten
// 25-11-2026 op twee kasten van Herman); vierkant gemaakt lagen ze op de modules.
async function fotoVoorAi(foto) {
  const img = new Image(); img.src = foto.url; await img.decode();
  const schaal = Math.min(1, AI_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * schaal), h = Math.round(img.naturalHeight * schaal);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  const z = Math.max(w, h), v = document.createElement("canvas"); v.width = z; v.height = z;
  const x = v.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, z, z);
  const dx = Math.round((z - w) / 2), dy = Math.round((z - h) / 2);
  x.drawImage(img, dx, dy, w, h);
  const blob = (cv) => new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.88));
  return { foto: await blob(c), vierkant: await blob(v), vak: { z, dx, dy, w, h } };
}
// Een punt van het vierkant (0–1000) terug naar de foto (0–1000 van breedte en hoogte).
const terugUitVierkant = (q, vak) => ({ x: ((q.x / 1000) * vak.z - vak.dx) / vak.w * 1000, y: ((q.y / 1000) * vak.z - vak.dy) / vak.h * 1000 });
async function vraagAi(modus, blob, verwacht) {
  const fd = new FormData();
  fd.append("modus", modus); fd.append("open", blob, "kast.jpg");
  if (verwacht) fd.append("verwacht", verwacht);
  const r = await fetch(AI_URL, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `fout ${r.status}`);
  return j;
}

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
  const aiUit = el("div", { class: "ai-uit", "aria-live": "polite" });
  const aiKnop = el("button", { type: "button", class: "hoofd", onclick: () => metAi() }, "🤖 Laat AI de kast bekijken");
  const aiBlok = el("div", { class: "vlak ai-blok" }, aiKnop,
    el("p", { class: "zacht klein", style: "margin:8px 0 0" }, "De AI zoekt de rails voor de kaders en kijkt of de kast anders is dan de sticker. Daarvoor gaat de foto naar de server van YourWkb; hij wordt daar niet bewaard. Kies je dit niet, dan blijft alles op je toestel."),
    aiUit);
  const opnieuw = el("button", { type: "button", onclick: () => { tikken = []; bijstellen = false; teken(); } }, "Opnieuw uitlijnen");
  const verschuif = el("button", { type: "button", onclick: () => { bijstellen = !bijstellen; teken(); } }, "Punten verschuiven");
  const svg = svgEl("svg", { viewBox: `0 0 ${foto.w} ${foto.h}`, class: "foto-laag", preserveAspectRatio: "none" });
  const vak = el("div", { class: "fotovak" }, el("img", { src: foto.url, alt: "Foto van de kast", draggable: "false" }));
  vak.append(svg);
  plek.replaceChildren(el("h2", {}, "De foto"), aiBlok, tekst, vak,
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

  async function metAi() {
    aiKnop.disabled = true; aiKnop.textContent = "De AI kijkt… (± een halve minuut)";
    aiUit.replaceChildren();
    try {
      const rails = m.rails.filter((r) => r.items.length);
      const verwacht = rails.map((r, k) => `rij ${k + 1}: ${r.breedte} modules`).join("; ");
      const ai = await fotoVoorAi(foto);
      const [rr, kr] = await Promise.allSettled([vraagAi("rails", ai.vierkant, verwacht), vraagAi("kast", ai.foto)]);
      // De kaders: de hoeken terug uit het vierkant naar de foto.
      const hoeken = rr.status === "fulfilled" && rr.value.gevonden && Array.isArray(rr.value.rails)
        ? rr.value.rails.map((r) => ({ ...r, ...Object.fromEntries(["linksboven", "rechtsboven", "rechtsonder", "linksonder"].map((k) => [k, r[k] ? terugUitVierkant(r[k], ai.vak) : r[k]])) }))
        : null;
      const t = hoeken ? tikkenUitAi(m.rails, hoeken, foto.w, foto.h) : null;
      if (t) { tikken = t; bijstellen = false; teken(); }
      const melding = [];
      if (!t) melding.push(el("p", { class: "melding" }, "De AI vond de rails niet goed genoeg", rr.status === "fulfilled" && rr.value.reden ? `: ${rr.value.reden}` : rr.status === "rejected" ? ` (${rr.reason.message})` : "", ". Tik de punten zelf aan."));
      // Het verschil met de sticker.
      if (kr.status === "fulfilled" && Array.isArray(kr.value.posities) && kr.value.posities.length) {
        const v = verschilMetFoto(m, kr.value.posities);
        melding.push(el("div", { class: "vlak" }, el("b", {}, v.gelijk ? "De AI ziet geen verschil met de sticker." : "Wat de AI anders ziet dan de sticker:"),
          v.gelijk ? null : el("ul", { style: "margin:6px 0 0;padding-left:20px" }, ...v.zinnen.map((z) => el("li", {}, z))),
          el("p", { class: "zacht klein", style: "margin:6px 0 0" }, "De AI kan zich vergissen; kijk zelf op de foto. Een gewijzigde kast is normaal: dan hoort er een nieuwe sticker bij.")));
      } else if (kr.status === "fulfilled") melding.push(el("p", { class: "melding" }, "De AI kon de kast niet lezen", kr.value.reden ? `: ${kr.value.reden}` : "", "."));
      else melding.push(el("p", { class: "melding" }, `De kast lezen lukte niet: ${kr.reason.message}`));
      aiUit.replaceChildren(...melding);
      if (t) tekst.textContent = "De AI heeft de kaders gelegd. Liggen ze niet goed? Verschuif de punten.";
    } catch (e) {
      aiUit.replaceChildren(el("p", { class: "melding" }, `Dat lukte niet: ${e.message}. Tik de punten zelf aan.`));
    } finally {
      aiKnop.disabled = false; aiKnop.textContent = "🤖 Laat AI de kast opnieuw bekijken";
    }
  }
}
