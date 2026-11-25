// De meterkastpaspoort-lezer — het scherm. Referentie-implementatie van de open
// standaard; importeert alleen de codec (../mkp.js) en het eigen model.
// Alles wat uit een paspoort komt is invoer van een vreemde: het gaat als tekst
// in de pagina (textContent), nooit als HTML.

import { mkpDecode, mkpVerifieer } from "../mkp.js";
import { fragmentUit, kastModel, herkomst, kastGegevens, reserveringen, SOORT_NAAM, ST_NAAM } from "./model.js";

const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinderen.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
// replaceChildren zet null om naar de tekst "null": eerst filteren.
const zet = (node, ...k) => node.replaceChildren(...k.filter((x) => x !== null && x !== undefined && x !== false && x !== ""));
const stil = (t) => { const s = $("stil"); s.textContent = t; s.style.display = "block"; clearTimeout(stil.t); stil.t = setTimeout(() => { s.style.display = "none"; }, 2600); };

// De sleutellijst van de standaard, voor de handtekeningen. Zonder netwerk uit de
// cache van de service worker; zonder lijst blijft een handtekening "nog niet te verifiëren".
let INDEX = null;
const indexKlaar = fetch("/veldnotities/index.json").then((r) => (r.ok ? r.json() : null)).then((j) => { INDEX = j; }).catch(() => {});

const VLAG = {
  geldig: ["ondertekend en geverifieerd", "v-ok"], onbekend: ["ondertekend, nog niet te verifiëren", "v-let"],
  ongeldig: ["handtekening komt niet overeen", "v-let"], geen: ["niet ondertekend", "v-geen"],
};
async function handtekening(regel) {
  if (!regel || !regel.sig) return "geen";
  await indexKlaar;
  const ins = INDEX && Array.isArray(INDEX.installateurs) ? INDEX.installateurs.find((i) => i && i.sleutel_id === regel.sid) : null;
  try { return await mkpVerifieer(regel, "sig", ins && ins.publieke_sleutel); } catch { return "onbekend"; }
}
const vlag = (st) => el("span", { class: `vlag ${VLAG[st][1]}` }, VLAG[st][0]);

// ── Lezen ─────────────────────────────────────────────────────────────────────
let huidig = "";   // het fragment dat nu getoond wordt
let laatstePaspoort = null;
async function lees(invoer) {
  const frag = fragmentUit(invoer);
  $("fout").replaceChildren();
  if (!frag) { toonInvoer(true); return; }
  let p;
  try { p = await mkpDecode(frag); }
  catch (e) {
    $("fout").replaceChildren(el("div", { class: "melding" }, "Dit is geen leesbaar meterkastpaspoort. ", el("span", { class: "zacht" }, String(e && e.message || ""))));
    toonInvoer(true); return;
  }
  huidig = frag;
  laatstePaspoort = p;
  // De link ís het paspoort: zet hem in de adresbalk, dan is de pagina zelf te delen.
  if (location.hash.slice(1) !== frag) history.replaceState(null, "", `${location.pathname}#${frag}`);
  toonInvoer(false);
  await toon(p);
}

// ── Tonen ─────────────────────────────────────────────────────────────────────
let keuze = null;    // { groep } of { item }
async function toon(p) {
  const m = kastModel(p);
  const h = herkomst(p);
  const uit = $("uit");
  keuze = null;

  // 1. Wat het is: adres, kast, stand.
  const kop = el("div", { class: "vlak" },
    el("div", { style: "font-size:22px;font-weight:800" }, m.adres || "Adres niet op de sticker"),
    m.kast ? el("div", {}, m.kast) : null,
    m.gevoed ? el("div", { class: "zacht" }, m.gevoed.tekst) : null,
    el("div", { class: "zacht klein" }, [
      m.bijgewerkt ? `bijgewerkt ${m.bijgewerkt}` : "", m.versie !== null ? `datamodel ${m.versie}` : "",
      m.status ? `indeling: ${ST_NAAM[m.status] || m.status}` : "", m.volgendeInspectie ? `volgende inspectie ${m.volgendeInspectie}` : "",
    ].filter(Boolean).join(" · ")));

  // 2. De herkomst, even prominent als de tekening.
  const laatste = h[0];
  const herkomstVlak = el("div", { class: "vlak herkomst" },
    el("div", { class: "zacht klein" }, "Dit heeft de laatste installateur verklaard — het is geen vaststelling van nu."));
  if (laatste) {
    herkomstVlak.append(...[
      el("div", { style: "margin-top:6px" }, el("b", {}, laatste.bedrijf || "Onbekend bedrijf"), laatste.datum ? ` · ${laatste.datum}` : ""),
      laatste.werk ? el("div", {}, laatste.werk) : null,
      laatste.opmerking ? el("div", { class: "zacht" }, laatste.opmerking) : null,
      erkenningRegel(laatste.erkenning),
      laatste.zegels.length ? el("div", { class: "zacht klein" }, `Zegel${laatste.zegels.length > 1 ? "s" : ""}: ${laatste.zegels.join(", ")}`) : null,
      laatste.meting && laatste.meting.tekst ? el("div", { class: "klein", style: "margin-top:4px" }, `Laatste meting${laatste.meting.datum ? ` (${laatste.meting.datum})` : ""}: ${laatste.meting.tekst}`) : null,
      el("div", { "data-st": "0" }, vlag("geen"))].filter(Boolean));
  } else herkomstVlak.append(el("div", { class: "melding", style: "margin-top:8px" }, "Er staat geen logboek op deze sticker: niet te zien wie dit heeft vastgelegd."));

  // 2b. Voorbereid op (spec 4.11): open en vooraan, want hier komt de installateur
  //     die een warmtepomp, laadpaal of thuisbatterij komt plaatsen voor.
  const rv = reserveringen(p);
  resPlekken = rv.lijst;
  const voorbereid = rv.lijst.length ? el("div", { class: "vlak voorbereid" },
    el("div", { class: "blok-titel", style: "margin-bottom:6px" }, "Voorbereid op"),
    ...rv.lijst.map((r) => el("div", { class: "res-regel" },
      el("div", {}, el("b", {}, r.naam), r.tekst ? ` — ${r.tekst}` : ""),
      r.toelichting ? el("div", { class: "zacht klein" }, r.toelichting) : null)),
    rv.grond ? el("p", { class: "klein", style: "margin:8px 0 0" }, rv.grond) : null,
    el("p", { class: "zacht klein", style: "margin:6px 0 0" }, "Een reservering is een intentie, geen garantie. Ga na of het nog klopt met de kast van nu.")) : null;

  // 3. Wat ontbreekt.
  const ontbreekt = m.ontbreekt.map((t) => el("div", { class: "melding" }, t));

  // 4. De tekening en de groepen naast elkaar. (De foto ernaast, het uitlijnen en de
  //    AI staan in de ijskast, besluit Martin 25-11-2026: commits 32d5e7b–1cdc9e4.)
  const herteken = () => {
    const oud = $("tekening"); if (!oud) return;
    oud.replaceWith(tekening(m));
    if ($("knopPas")) $("knopPas").textContent = passend ? "Groot, met schuiven" : "Hele kast in beeld";
    if (keuze) { const k = keuze; keuze = null; kies(k); }
  };
  const kastDeel = el("div", { id: "tekeningPlek" });
  if (m.rails.length) {
    kastDeel.append(...[el("h2", {}, "De indeling"),
      el("p", { class: "tekening-uitleg" }, "Van links naar rechts, rail voor rail. Tik op een module of een groep."),
      el("div", { class: "knoppen", style: "margin:0 0 8px" }, el("button", { type: "button", id: "knopPas", onclick: () => { passend = !passend; herteken(); } },
        passend ? "Groot, met schuiven" : "Hele kast in beeld")),
      tekening(m), el("div", { id: "detail", class: "vlak klein", style: "min-height:48px" }, el("span", { class: "zacht" }, "Tik op een module voor wat hij is.")),
      el("p", { class: "vraag" }, "Klopt dit met wat je ziet?"),
    ].filter(Boolean));
  }
  const groepenDeel = el("div", {}, el("h2", {}, `Groepen${m.groepen.length ? ` (${m.groepen.length})` : ""}`), groepenLijst(m));
  // Uitklapblokken, zoals de meetblokken in de app: kop met een korte samenvatting.
  const blok = (titel, samenvatting, open, ...inhoud) => el("details", { class: "vlak blok", open: open || null },
    el("summary", {}, el("span", { class: "blok-titel" }, titel), samenvatting ? el("span", { class: "blok-sam" }, samenvatting) : null),
    el("div", { class: "blok-inhoud" }, ...inhoud));
  const kg = kastGegevens(p, m);
  // De gegevens van de kast (adres, bouwjaar, aansluiting, kam, EAN …) staan bovenin het kastblok.
  const gegevens = kg.rijen.length ? el("div", { class: "gegevens" },
    el("dl", { class: "rijen" }, ...kg.rijen.flatMap(([k, w]) => [el("dt", {}, k), el("dd", {}, w)])),
    laatste && laatste.meting && laatste.meting.tekst ? el("p", { class: "klein", style: "margin:8px 0 0" }, `Laatste meting${laatste.meting.datum ? ` (${laatste.meting.datum})` : ""}: ${laatste.meting.tekst}`) : null) : null;
  const lbDeel = kg.lb ? el("div", { class: "deel" }, el("div", { class: "deel-kop" }, "Load balancing"),
    el("p", { style: "margin:0" }, kg.lb.tekst),
    el("p", { class: "zacht klein", style: "margin:6px 0 0" }, "Een instelling, geen veiligheidsmaatregel: hij kan gewijzigd of opgeheven zijn.")) : null;
  const chkDeel = kg.chk ? el("div", { class: "deel" }, el("div", { class: "deel-kop" }, "Laatste belastingcheck"),
    el("p", { style: "margin:0" }, el("span", { class: `chk chk-${/^(groen|oranje|rood)$/.test(kg.chk.r) ? kg.chk.r : "anders"}` }, kg.chk.r), kg.chk.d ? ` op ${kg.chk.d}` : ""),
    el("p", { class: "zacht klein", style: "margin:6px 0 0" }, "Zoals de installateur hem toen heeft vastgelegd; geen uitkomst van nu.")) : null;

  const twee = el("div", { class: "twee" }, kastDeel, groepenDeel);
  // De kast in één uitklapscherm, ingeklapt zoals in de app (besluit Martin 25-11-2026):
  // de gegevens, de indeling en de groepen, de load balancing en de laatste belastingcheck.
  const kastBlok = blok("De kast",
    [kg.samenvatting, `${m.groepen.length} groep${m.groepen.length === 1 ? "" : "en"}`, kg.chk ? `check ${kg.chk.r}` : ""].filter(Boolean).join(" · "),
    false, gegevens, el("div", { class: gegevens ? "deel" : "" }, twee), lbDeel, chkDeel);
  // "Hele kast in beeld" rekent met de breedte van de kolom; die is er pas als het blok open is.
  kastBlok.addEventListener("toggle", () => { if (kastBlok.open && passend) herteken(); });

  // 5. Het logboek, in volgorde.
  // De rest van het logboek zit in de herkomst, als uitklap onder de laatste regel
  // (besluit Martin 25-11-2026): eerst wat de laatste installateur verklaarde, dan
  // desgewenst wat daarvoor is gebeurd. Geen apart logboekblok meer.
  if (h.length > 1) herkomstVlak.append(el("details", { class: "eerder" },
    el("summary", {}, `Wat er daarvoor is gebeurd (${h.length - 1})`),
    ...h.slice(1).map((r, k) => el("div", { style: "border-top:1px solid var(--rand);padding:10px 0" },
      el("div", {}, el("b", {}, r.bedrijf || "Onbekend bedrijf"), r.datum ? ` · ${r.datum}` : ""),
      r.werk ? el("div", {}, r.werk) : null,
      r.opmerking ? el("div", { class: "zacht" }, r.opmerking) : null,
      erkenningRegel(r.erkenning),
      r.zegels.length ? el("div", { class: "zacht klein" }, `Zegel${r.zegels.length > 1 ? "s" : ""}: ${r.zegels.join(", ")}`) : null,
      r.meting && r.meting.tekst ? el("div", { class: "klein" }, `Meting: ${r.meting.tekst}`) : null,
      el("div", { "data-st": String(k + 1) }, vlag("geen"))))));

  // 6. Delen en verder.
  const knoppen = el("div", { class: "acties" },
    // Verder in YourWkb, zoals de stickerlink: het paspoort reist in het #-deel mee
    // (gaat niet naar een server). De ingang #uitbreiding= start daar meteen een
    // nieuw project met deze gegevens, zonder eerst de weergave in de app (25-11-2026).
    el("a", { class: "knop hoofd", href: `https://yourwkb.nl/app#uitbreiding=${huidig}`, rel: "noopener" }, "Uitbreiding vastleggen in YourWkb →"),
    el("button", { type: "button", onclick: deel }, "Deel dit paspoort"),
    el("button", { type: "button", onclick: () => verklaring(m, h) }, "Groepenoverzicht (A4)"),
    el("button", { type: "button", onclick: () => { history.replaceState(null, "", location.pathname); uit.replaceChildren(); toonInvoer(true); } }, "Andere sticker"));

  const onbekend = m.onbekend.length
    ? el("p", { class: "zacht klein" }, `Op deze sticker staan gegevens die deze lezer niet kent (${m.onbekend.join(", ")}); die zijn overgeslagen.`)
    : null;

  uit.replaceChildren(...[kop, herkomstVlak, voorbereid, ...ontbreekt, kastBlok, knoppen, onbekend].filter(Boolean),
    el("p", { class: "zacht klein" }, "Een handtekening toont aan dat een logregel onveranderd is en van de houder van die sleutel komt. Niet dat de installatie deugt, en niet dat de sticker op de juiste kast zit."));

  // "Hele kast in beeld" rekent met de breedte van de kolom: die is er pas nu.
  if (passend) herteken();

  // De handtekeningen na het tekenen: de tekening wacht niet op de sleutellijst.
  for (const [i, r] of h.entries()) {
    const st = await handtekening(r.regel);
    for (const plek of uit.querySelectorAll(`[data-st="${i}"]`)) plek.replaceChildren(vlag(st));
  }
}

function erkenningRegel(e) {
  if (!e) return el("div", { class: "zacht klein" }, "Geen erkenning vermeld.");
  const soort = e.soort === "erkenning" ? "erkenning" : e.soort === "certificaat" ? "certificaat" : e.soort;
  return el("div", { class: "klein" }, `${e.naam} ${e.nummer} (${soort}${e.register && e.register !== e.naam ? `, register ${e.register}` : ""})`,
    e.opzoek ? [" — ", el("a", { href: e.opzoek, target: "_blank", rel: "noopener noreferrer" }, `controleer bij ${e.register || e.naam}`)] : " — controleer in het openbare register");
}

const GAP = 3;
let passend = false;   // "hele kast in beeld" of groot met schuiven
function modulePx(m) {
  if (!passend) return 46;
  const breedst = Math.max(m.mpr || 0, ...m.rails.map((r) => r.breedte), ...resPlekken.filter((x) => x.plek).map((x) => x.plek.tot), 1);
  const plek = $("tekeningPlek");
  const beschikbaar = Math.max(140, ((plek && plek.clientWidth) || $("uit").clientWidth || 340) - 34);
  return Math.max(6, Math.floor((beschikbaar - (breedst - 1) * GAP) / breedst));
}
// De gereserveerde plekken (uit toon), zodat de tekening ze kan aanwijzen.
let resPlekken = [];
const RES_KORT = { wp: "WP", lp: "LP", bat: "BAT", pv: "PV", kook: "KOOK", ov: "RES" };
function reserveringVoor(rail, van, tot) {
  return resPlekken.find((r) => r.plek && r.plek.rail === rail && r.plek.van <= tot && r.plek.tot >= van) || null;
}
function tekening(m) {
  const MODULE_PX = modulePx(m);
  const klein = MODULE_PX < 24 ? (MODULE_PX < 12 ? " mini piep" : " mini") : "";
  const kast = el("div", { class: `kast${passend ? " passend" : ""}${klein}`, id: "tekening", role: "group", "aria-label": "Tekening van de kast" });
  for (const r of m.rails) {
    const rij = el("div", { class: "rail" }, el("div", { class: "railnr" }, String(r.nr)));
    for (const it of r.items) {
      const breedte = it.breedte * MODULE_PX + (it.breedte - 1) * GAP;
      const res = reserveringVoor(r.nr, it.positie + 1, it.positie + it.breedte);
      const label = [SOORT_NAAM[it.soort] || it.soort, it.bev, it.groep ? `groep ${it.groep}` : "", it.naam, res ? `gereserveerd voor ${res.naam.toLowerCase()}` : ""].filter(Boolean).join(", ");
      rij.append(el("button", {
        class: `mod ${it.soort}${it.leeg ? " leeg" : ""}${res ? " gereserveerd" : ""}`, title: res ? `Gereserveerd voor ${res.naam.toLowerCase()}` : null, type: "button", style: `width:${breedte}px`, "data-item": String(it.i),
        "data-groep": it.groep ? String(it.groep) : null, "aria-label": label, disabled: it.leeg || null,
        onclick: it.leeg ? null : () => kies({ item: it, groep: it.groep }),
      }, res && it.leeg ? el("span", { class: "k res-k" }, RES_KORT[res.t] || "RES") : null, it.kort ? el("span", { class: "k" }, it.kort) : null, it.bev ? el("span", { class: "b" }, it.bev.split(" · ")[0]) : null,
        it.groep ? el("span", { class: "g" }, String(it.groep)) : null, it.naam && it.breedte >= 1 ? el("span", { class: "n" }, it.naam) : null));
    }
    // De rest van de rail: tot de railbreedte als de sticker die noemt, en anders
    // tot het eind van een reservering die achter de laatste module ligt. Per stuk:
    // vrij, of gereserveerd voor iets.
    const eindRes = Math.max(0, ...resPlekken.filter((x) => x.plek && x.plek.rail === r.nr).map((x) => x.plek.tot));
    const eind = Math.max(m.mpr || 0, eindRes);
    for (let van = r.breedte + 1; van <= eind;) {
      const res = reserveringVoor(r.nr, van, van);
      let tot = van;
      while (tot < eind && reserveringVoor(r.nr, tot + 1, tot + 1) === res) tot++;
      const n = tot - van + 1;
      rij.append(el("div", { class: `mod vrij${res ? " gereserveerd" : ""}`, style: `width:${n * MODULE_PX + (n - 1) * GAP}px`, "aria-hidden": res ? null : "true", title: res ? `Gereserveerd voor ${res.naam.toLowerCase()}` : null },
        res ? el("span", { class: "k res-k" }, RES_KORT[res.t] || "RES") : null));
      van = tot + 1;
    }
    kast.append(rij);
  }
  return kast;
}

function groepenLijst(m) {
  if (!m.groepen.length) return el("p", { class: "zacht" }, "Geen groepen op deze sticker.");
  return el("div", { class: "groepen" }, ...m.groepen.map((g) => el("button", {
    class: "groep", type: "button", "data-groep": String(g.nr), onclick: () => kies({ groep: g.nr, uitLijst: true }),
  }, el("span", { class: "nr" }, String(g.nr)), g.naam || g.type,
    el("div", { class: "zacht klein" }, [g.naam ? g.type : "", g.rol, g.fase, g.kw ? `${String(g.kw).replace(".", ",")} kW` : "", g.onderverdeler ? "voedt een onderverdeler" : ""].filter(Boolean).join(" · ")))));
}

// Aantikken: een module licht zijn groep op, een groep zijn module(s).
function kies(k) {
  const uit = $("uit");
  for (const e of uit.querySelectorAll(".aan")) e.classList.remove("aan");
  const zelfde = keuze && ((k.groep && keuze.groep === k.groep) || (k.item && keuze.item && keuze.item.i === k.item.i));
  keuze = zelfde ? null : k;
  const detail = $("detail");
  if (!keuze) { if (detail) zet(detail, el("span", { class: "zacht" }, "Tik op een module voor wat hij is.")); return; }
  if (keuze.groep) for (const e of uit.querySelectorAll(`[data-groep="${keuze.groep}"]`)) e.classList.add("aan");
  if (keuze.item) for (const e of uit.querySelectorAll(`[data-item="${keuze.item.i}"]`)) e.classList.add("aan");
  if (detail) {
    const it = keuze.item;
    if (it) zet(detail, el("b", {}, SOORT_NAAM[it.soort] || it.soort), it.bev ? ` · ${it.bev}` : "", ` · ${it.breedte} ${it.breedte === 1 ? "module" : "modules"}`,
      it.polen ? ` · ${it.polen}` : "", it.groep ? ` · groep ${it.groep}` : " · geen groep", it.achter ? ` · achter aardlek ${it.achter}` : "",
      it.naam ? el("div", {}, it.naam) : null);
    else zet(detail, el("b", {}, `Groep ${keuze.groep}`), uit.querySelector(`.mod[data-groep="${keuze.groep}"]`) ? " — opgelicht in de kast" : " — staat niet in de tekening");
  }
  if (keuze.uitLijst) { const e = uit.querySelector(`.mod[data-groep="${keuze.groep}"]`); if (e) e.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }
}

async function verklaring(m, h) {
  const status = h[0] ? await handtekening(h[0].regel) : "geen";
  const V = await import("./verklaring.js");
  const y = window.scrollY;
  V.toonVerklaring({ el, m, p: laatstePaspoort, h, frag: huidig, status, terug: () => window.scrollTo(0, y) });
}

async function deel() {
  const url = `${location.origin}/lezer/#${huidig}`;
  try {
    if (navigator.share) { await navigator.share({ title: "Meterkastpaspoort", text: "Het paspoort van deze meterkast:", url }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); stil("Link gekopieerd"); }
  catch { prompt("Kopieer deze link:", url); }
}

// ── Invoer: plakken en scannen ────────────────────────────────────────────────
function toonInvoer(ja) { $("invoer").hidden = !ja; if (!ja) stopScan(); }
$("knopLees").addEventListener("click", () => lees($("plak").value));
$("knopScan").addEventListener("click", () => (stroom ? stopScan() : startScan()));

let stroom = null, lus = null;
async function startScan() {
  try {
    stroom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch {
    $("fout").replaceChildren(el("div", { class: "melding" }, "De camera is niet beschikbaar. Plak de link, of open de pagina via de camera-app van je telefoon."));
    return;
  }
  const v = $("video"); v.srcObject = stroom; await v.play();
  $("scan").hidden = false; $("scanTekst").hidden = false; $("knopScan").textContent = "Stop de camera";
  const lezer = await qrLezer();
  const doek = document.createElement("canvas"), ctx = doek.getContext("2d", { willReadFrequently: true });
  const stap = async () => {
    if (!stroom) return;
    try {
      const tekst = await lezer(v, doek, ctx);
      if (tekst && fragmentUit(tekst)) {
        stopScan(); await lees(tekst); return;
      }
    } catch { /* volgende beeld */ }
    lus = setTimeout(stap, 180);
  };
  stap();
}
function stopScan() {
  clearTimeout(lus); lus = null;
  if (stroom) for (const t of stroom.getTracks()) t.stop();
  stroom = null;
  if ($("scan")) { $("scan").hidden = true; $("scanTekst").hidden = true; $("knopScan").textContent = "📷 Scan de QR-code"; }
}
// BarcodeDetector waar de browser hem heeft (Android, Chrome); anders jsQR, pas
// geladen als iemand scant (iPhone, Safari).
async function qrLezer() {
  if ("BarcodeDetector" in window) {
    try {
      const formaten = await window.BarcodeDetector.getSupportedFormats();
      if (formaten.includes("qr_code")) {
        const d = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (v) => { const r = await d.detect(v); return r[0] && r[0].rawValue; };
      }
    } catch { /* val terug op jsQR */ }
  }
  if (!window.jsQR) await new Promise((ok, mis) => { const s = document.createElement("script"); s.src = "/lezer/vendor/jsqr.min.js"; s.onload = ok; s.onerror = mis; document.head.append(s); });
  return async (v, doek, ctx) => {
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return null;
    const schaal = Math.min(1, 960 / Math.max(w, h));
    doek.width = Math.round(w * schaal); doek.height = Math.round(h * schaal);
    ctx.drawImage(v, 0, 0, doek.width, doek.height);
    const r = window.jsQR(ctx.getImageData(0, 0, doek.width, doek.height).data, doek.width, doek.height, { inversionAttempts: "dontInvert" });
    return r && r.data;
  };
}

// ── Start ────────────────────────────────────────────────────────────────────
window.addEventListener("hashchange", () => { const f = location.hash.slice(1); if (f && f !== huidig) lees(f); });
if (location.hash.length > 1) lees(location.hash.slice(1)); else toonInvoer(true);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/lezer/sw.js", { scope: "/lezer/" }).catch(() => {});
