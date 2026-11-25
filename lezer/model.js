// De meterkastpaspoort-lezer — het model: van een paspoort naar wat de lezer toont.
// Pure functies, zonder DOM, zodat ze te testen zijn (tests/test-lezer.js).
// Importeert alleen de codec van deze standaard. Niets uit een app.
//
// Zuiverheidsregel: de lezer tekent wat het paspoort VERKLAART. Hij oordeelt niet,
// toetst niets en vult niets aan dat er niet staat.

import { mkpIndeling, mkpOnbekendePaden, mkpRegister, mkpVolgendeInspectie, mkpVerdeelinrichting } from "../mkp.js";

/** Het fragment uit wat iemand plakt of scant: een hele link, of alleen het fragment. */
export function fragmentUit(tekst) {
  const t = String(tekst == null ? "" : tekst).trim();
  if (!t) return "";
  const i = t.indexOf("#");
  return (i >= 0 ? t.slice(i + 1) : t).trim();
}

const SOORT_KORT = {
  hoofdschakelaar: "HS", automaat: "", aardlek: "AL", aardlekautomaat: "ALA", overspanning: "SPD",
  beltrafo: "trafo", schakeltoestel: "schak.", "kwh-meter": "kWh", "pv-scheider": "PV", lastscheider: "LS",
  overig: "overig", smeltveiligheid: "zek.", gereserveerd: "?",
};
export const SOORT_NAAM = {
  hoofdschakelaar: "Hoofdschakelaar", automaat: "Installatieautomaat", aardlek: "Aardlekschakelaar",
  aardlekautomaat: "Aardlekautomaat", overspanning: "Overspanningsbeveiliging", beltrafo: "Beltransformator",
  schakeltoestel: "Schakeltoestel", "kwh-meter": "kWh-meter", "pv-scheider": "PV-scheider", lastscheider: "Lastscheider",
  overig: "Overig", smeltveiligheid: "Smeltveiligheid", gereserveerd: "Onbekend toestel", leeg: "Lege plaats",
};
export const TYPE_NAAM = { alg: "algemene groep", kook: "kookgroep", wp: "warmtepomp", lp: "laadpunt",
  pv: "zonnepanelen", bat: "thuisbatterij", ov: "overig" };
export const ST_NAAM = { gemeten: "gemeten", ontworpen: "ontworpen, nog niet gebouwd", gebouwd: "gebouwd, nog niet gemeten" };

const tekst = (v) => (v == null ? "" : String(v));

/** De beveiliging van één toestel in een paar tekens: "B16", "30 mA A", "40 A". */
export function bevTekst(t) {
  const delen = [];
  if (t.kar && t.In) delen.push(t.kar === "gG" ? `gG ${t.In}` : `${t.kar}${t.In}`);
  else if (t.In) delen.push(`${t.In} A`);
  if (t.idn) delen.push(`${t.idn} mA`);
  if (t.lek) delen.push(`type ${t.lek}`);
  if (t.selectief) delen.push("S");
  return delen.join(" · ");
}

/**
 * De kast zoals het paspoort hem beschrijft. Altijd een object; wat ontbreekt,
 * staat in `ontbreekt` (in woorden), wat de lezer niet kent in `onbekend`.
 */
export function kastModel(p) {
  const uit = {
    versie: typeof p?.v === "number" ? p.v : null,
    adres: [p?.pc, p?.nr].filter(Boolean).map(tekst).join(" "),
    bijgewerkt: tekst(p?.d),
    status: null, mpr: null, rails: [], groepen: [], ontbreekt: [], onbekend: [],
    kast: null, gevoed: null, volgendeInspectie: mkpVolgendeInspectie(p) || "",
  };
  const vi = mkpVerdeelinrichting(p);
  if (vi) { uit.kast = vi.kast || null; uit.gevoed = vi.gevoed || null; }

  // Groepen: de lijst uit grp[], met hun plaats (1-based) als nummer.
  const grp = Array.isArray(p?.grp) ? p.grp : [];
  uit.groepen = grp.map((g, i) => ({
    nr: i + 1,
    naam: tekst(g && g.n),
    type: TYPE_NAAM[g && g.t] || tekst(g && g.t),
    rol: g && g.rol === "voed" ? "voedend" : "afgaand",
    fase: Array.isArray(g && g.fn) ? `fase ${g.fn.map(tekst).join("+")}` : (g && g.f ? `${tekst(g.f)}-fase` : ""),
    kw: g && typeof g.kw === "number" ? g.kw : null,
    onderverdeler: !!(g && g.vd),
  }));
  if (!grp.length) uit.ontbreekt.push("De groepen staan niet op deze sticker.");

  // De indeling: rails met toestellen, van links naar rechts.
  const r = mkpIndeling(p);
  if (!r) {
    uit.ontbreekt.push(uit.versie !== null && uit.versie < 3
      ? `Deze sticker is van vóór de indeling (datamodel ${uit.versie}): er staat geen tekening van de kast op.`
      : "Deze sticker draagt geen indeling van de kast. Dat kan zijn omdat de kast niet volledig was doorgemeten, of omdat de indeling niet op de sticker paste.");
  } else if (r.fout) {
    uit.ontbreekt.push("De indeling op deze sticker is niet leesbaar; de rest wel.");
  } else if (r.overgeslagen) {
    uit.ontbreekt.push(`De indeling op deze sticker is in een nieuwere versie (${tekst(r.versie)}) dan deze lezer kent.`);
  } else {
    const u = r.indeling;
    uit.status = u.st || null;
    uit.mpr = u.mpr || null;
    let rail = { nr: 1, items: [], breedte: 0 };
    let n = 0;
    let letters = 0;   // aardlekken heten A, B, C in leesvolgorde
    const letterVan = (n) => String.fromCharCode(64 + n);   // al = n → de n-de aardlek
    for (const t of u.toestellen) {
      if (t.soort === "railscheiding") { uit.rails.push(rail); rail = { nr: rail.nr + 1, items: [], breedte: 0 }; continue; }
      const breedte = t.breedte || 1;
      const groep = Number.isInteger(t.groep) && t.groep >= 1 ? t.groep : null;
      const g = groep && grp[groep - 1] ? grp[groep - 1] : null;
      const letter = t.soort === "aardlek" ? String.fromCharCode(65 + (letters++ % 26)) : null;
      rail.items.push({
        i: n++, soort: t.soort, leeg: t.soort === "leeg", breedte, positie: rail.breedte, rail: rail.nr,
        letter,
        // Blokversie 2: achter welke aardlek (zoals de installateur het vastlegde). Anders null.
        achter: Number.isInteger(t.al) && t.al >= 1 ? letterVan(t.al) : null,
        kort: t.soort === "leeg" ? "" : letter ? `AL ${letter}` : (SOORT_KORT[t.soort] ?? ""),
        bev: t.soort === "leeg" ? "" : bevTekst(t),
        naam: tekst(t.naam) || (g && g.n ? tekst(g.n) : ""),
        groep: g ? groep : null,
        polen: tekst(t.polen),
      });
      rail.breedte += breedte;
    }
    uit.rails.push(rail);
    if (grp.length && !uit.rails.some((rl) => rl.items.some((it) => it.groep)))
      uit.ontbreekt.push("De tekening koppelt de modules niet aan de groepen: die koppeling staat niet in de indeling op deze sticker.");
    if (uit.status && uit.status !== "gemeten") uit.ontbreekt.push(`De indeling is ${ST_NAAM[uit.status] || uit.status}.`);
  }

  // Wat de lezer niet kent: overslaan, en zeggen dat hij dat doet.
  try { uit.onbekend = mkpOnbekendePaden(p); } catch { uit.onbekend = []; }
  return uit;
}

/**
 * De herkomst: wie heeft wat wanneer verklaard. Het logboek in de volgorde van
 * het paspoort (de nieuwste staat bovenaan), met per regel de erkenning en het
 * registertype. De handtekeningstatus vult de lezer zelf in (die vraagt de index).
 */
export function herkomst(p) {
  const log = Array.isArray(p?.log) ? p.log : [];
  return log.map((r) => {
    const reg = r && r.erk ? mkpRegister(r.erk) : null;
    return {
      datum: tekst(r && r.d), bedrijf: tekst(r && r.b), werk: tekst(r && r.w), opmerking: tekst(r && r.c),
      erkenning: reg ? {
        nummer: reg.nummer, uitgever: reg.uitgever,
        naam: reg.regel ? reg.regel.naam : reg.uitgever,
        soort: reg.regel ? reg.regel.soort : "onbekend register",
        register: reg.register ? reg.register.naam : "",
        opzoek: reg.register && /^https:\/\//.test(reg.register.opzoek || "") ? reg.register.opzoek.replace("{nummer}", encodeURIComponent(reg.nummer)) : null,
      } : null,
      zegels: Array.isArray(r && r.zeg) ? r.zeg.map(tekst) : (r && typeof r.zeg === "string" ? [r.zeg] : []),
      meting: r && typeof r.ma === "string" ? leesAnker(r.ma) : null,
      ondertekend: !!(r && r.sig),
      regel: r,
    };
  });
}

/** Het meetanker (log[].ma) in woorden; null als het niet te lezen is. */
export function leesAnker(t) {
  const d = String(t).split(";");
  if (d.length !== 6) return null;
  const g = (x, f = 1) => (/^\d+(\.\d+)?$/.test(x) ? Number(x) / f : null);
  const k = (x, n = 2) => String(Math.round(x * 10 ** n) / 10 ** n).replace(".", ",");
  const delen = [];
  const zln = g(d[2], 100), zlpe = g(d[3], 100), iso = g(d[4]);
  if (zln !== null) delen.push(`Z L-N ${k(zln)} Ω`);
  if (zlpe !== null) delen.push(`Z L-PE ${k(zlpe)} Ω`);
  if (iso !== null) delen.push(iso >= 999 ? "isolatie > 999 MΩ" : `isolatie ${k(iso, 1)} MΩ`);
  const dt = d[5] ? d[5].split(",").map((x) => g(x)).filter((x) => x !== null) : [];
  if (dt.length) delen.push(`ΔT ${dt.map((x) => Math.round(x)).join("/")} ms`);
  const datum = /^\d{6}$/.test(d[0]) ? `20${d[0].slice(0, 2)}-${d[0].slice(2, 4)}-${d[0].slice(4, 6)}` : "";
  return { datum, instrument: d[1] || "", tekst: delen.join(" · ") };
}

/**
 * De groepenverklaring: per groep nummer, waar hij voor is, aardlek en stroom.
 * Achter welke aardlek een groep hangt, staat op de sticker sinds blokversie 2
 * (veld `al`, 25-11-2026): dan staat de letter erbij. Een aardlekautomaat is
 * zijn eigen aardlek. Staat het er niet, dan blijft het veld leeg — op papier om
 * met de hand in te vullen. Nooit afleiden uit de plaats: aardlekken staan vaak
 * naast elkaar met alle automaten erachter.
 */
export function groepenVerklaring(m) {
  const items = m.rails.flatMap((r) => r.items);
  const aardlekken = items.filter((it) => it.letter).map((it) => ({ letter: it.letter, bev: it.bev, rail: it.rail }));
  const regels = m.groepen.map((g) => {
    const it = items.find((x) => x.groep === g.nr) || null;
    let aardlek = "";
    if (it && it.achter) aardlek = it.achter;
    else if (it && it.soort === "aardlekautomaat") aardlek = `eigen (aardlekautomaat${it.bev.includes("mA") ? `, ${it.bev.split(" · ").filter((d) => /mA|type/.test(d)).join(" ")}` : ""})`;
    return {
      nr: g.nr, naam: g.naam || g.type || "", type: g.naam ? g.type : "", fase: g.fase,
      aardlek, stroom: it && it.bev ? it.bev.split(" · ")[0] : "", inTekening: !!it, onderverdeler: g.onderverdeler,
    };
  });
  // Of de sticker voor elke groep in de tekening zegt achter welke aardlek hij hangt.
  const metAardlek = regels.filter((r) => r.inTekening).every((r) => r.aardlek) && regels.some((r) => r.inTekening);
  return { regels, aardlekken, gekoppeld: regels.some((r) => r.inTekening), metAardlek };
}

/**
 * Een rail op een foto: de gebruiker tikte het begin (a) en het eind (b) van de
 * rail aan, op halve hoogte van de modules. Elke module krijgt een vierhoek op
 * de lijn ertussen, naar zijn plaats en breedte in modules. Pixels zijn alleen
 * om aan te wijzen: er wordt niets uit gemeten.
 * @returns [{ i, groep, soort, hoeken: [[x,y]×4], midden: [x,y] }]
 */
export function projecteer(rail, a, b) {
  const totaal = Math.max(1, rail.breedte || 0);
  const dx = b.x - a.x, dy = b.y - a.y, lengte = Math.hypot(dx, dy);
  if (!(lengte > 0)) return [];
  const ux = dx / lengte, uy = dy / lengte;          // langs de rail
  const nx = -uy, ny = ux;                           // loodrecht erop
  const mod = lengte / totaal;
  const half = (mod * 2.6) / 2;                      // een DIN-module is ±2,6 keer zo hoog als breed
  const punt = (t, s) => [Math.round((a.x + ux * t + nx * s) * 10) / 10, Math.round((a.y + uy * t + ny * s) * 10) / 10];
  return rail.items.map((it) => {
    const t0 = it.positie * mod, t1 = (it.positie + it.breedte) * mod;
    return { i: it.i, groep: it.groep, soort: it.soort, leeg: it.leeg,
      hoeken: [punt(t0, -half), punt(t1, -half), punt(t1, half), punt(t0, half)], midden: punt((t0 + t1) / 2, 0) };
  });
}

/**
 * De gegevens van de kast zoals de oude lezer en de app ze tonen: adres, bouwjaar,
 * hoofdaansluiting, kam, EAN, stelsel, load balancing en de laatste belastingcheck.
 * Alleen wat op de sticker staat; een leeg veld komt niet in de lijst.
 * @returns {{ rijen: [string, string][], samenvatting: string, lb: object|null, chk: object|null }}
 */
export function kastGegevens(p, m) {
  const t = (v) => (v == null ? "" : String(v).trim());
  const ha = p && typeof p.ha === "object" && p.ha ? p.ha : null;
  const kam = p && typeof p.kam === "object" && p.kam ? p.kam : null;
  const aansluiting = ha && (ha.a || ha.f) ? `${t(ha.f) || "?"}-fase × ${t(ha.a) || "?"} A${ha.hs ? ` · hoofdschakelaar ${t(ha.hs)} A` : ""}` : "";
  const kamTekst = kam && (kam.mm2 || kam.a) ? [kam.mm2 ? `${t(kam.mm2)} mm²` : "", kam.a ? `max ${t(kam.a)} A` : ""].filter(Boolean).join(" · ") : "";
  const rijen = [
    ["Verdeelinrichting", t(m && m.kast)],
    ["Gevoed uit", t(m && m.gevoed && m.gevoed.tekst)],
    ["Adres", t(m && m.adres)],
    ["Bouwjaar kast", t(p && p.bj)],
    ["Stelsel", typeof (p && p.stl) === "string" ? p.stl : ""],
    ["Hoofdaansluiting", aansluiting],
    ["Kam / ontwerpstroom", kamTekst],
    ["EAN aansluiting", t(p && p.ean)],
    ["EAN secundair", t(p && p.ean2)],
    ["Laatst bijgewerkt", t(p && p.d)],
    ["Volgende inspectie", t(m && m.volgendeInspectie)],
    ["Datamodel", m && m.versie !== null && m.versie !== undefined ? String(m.versie) : ""],
  ].filter(([, w]) => w);
  const samenvatting = [ha && ha.a ? `${t(ha.f) || "?"} × ${t(ha.a)} A` : "", typeof (p && p.stl) === "string" ? p.stl : "", p && p.bj ? `bouwjaar ${t(p.bj)}` : ""].filter(Boolean).join(" · ");

  let lb = null;
  if (p && p.lb && typeof p.lb === "object") {
    const soort = p.lb.typ === "dyn" ? "Dynamisch" : p.lb.typ === "stat" ? "Statisch" : "Aanwezig";
    lb = p.lb.aan
      ? { aan: true, tekst: [soort, p.lb.max ? `grens ${t(p.lb.max)} A` : "", p.lb.reg ? `regisseur: ${t(p.lb.reg)}` : ""].filter(Boolean).join(" · ") }
      : { aan: false, tekst: "Niet aanwezig" };
  }
  let chk = null;
  if (p && p.chk && typeof p.chk === "object" && p.chk.r) chk = { r: t(p.chk.r), d: t(p.chk.d) };
  return { rijen, samenvatting, lb, chk };
}

// ─── De foto: perspectief (25-11-2026) ────────────────────────────────────────
// Een foto van een kast is zelden recht van voren genomen. Een rechte lijn per
// rail verdeelt de modules gelijk, maar in perspectief liggen de modules die
// verder weg zijn dichter op elkaar. Vier punten bepalen dat perspectief: een
// homografie van "modules en rails" naar pixels.

/** Homografie uit vier puntparen: van[i] = [x, y] → naar[i] = [x, y]. null als de punten op één lijn liggen. */
export function homografie(van, naar) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = van[i], [u, v] = naar[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gauss met rijwissel.
  for (let k = 0; k < 8; k++) {
    let p = k;
    for (let r = k + 1; r < 8; r++) if (Math.abs(A[r][k]) > Math.abs(A[p][k])) p = r;
    if (Math.abs(A[p][k]) < 1e-12) return null;
    [A[k], A[p]] = [A[p], A[k]]; [b[k], b[p]] = [b[p], b[k]];
    for (let r = 0; r < 8; r++) {
      if (r === k) continue;
      const f = A[r][k] / A[k][k];
      for (let c = k; c < 8; c++) A[r][c] -= f * A[k][c];
      b[r] -= f * b[k];
    }
  }
  return [...b.map((w, i) => w / A[i][i]), 1];
}
export function pasToe(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** De omgekeerde homografie (pixels → kast). */
export function omgekeerd(H) {
  const [a, b, c, d, e, f, g, h, k] = H;
  const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A, -(b * k - c * h), b * f - c * e, B, a * k - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/**
 * Welke punten de gebruiker aantikt. Eerst de vier hoeken van de rij modules op
 * de langste rail: die is breed, dus een tik die een paar pixels mis is, verschuift
 * de rest nauwelijks. Daarna per andere rail één tik: de linkerrand van zijn eerste
 * module, op halve hoogte — dat zegt waar die rail op de kast zit.
 * (Begin en eind van twee rails was te gevoelig: met één korte rail zaten de
 * kaders bij 4 pixels tikfout tot 100 pixels naast de modules.)
 */
export function tikStappen(rails) {
  const r = rails.filter((x) => x.items && x.items.length);
  if (!r.length) return [];
  const lang = [...r].sort((a, b) => b.breedte - a.breedte || a.nr - b.nr)[0];
  const welke = r.length > 1 ? `rail ${lang.nr}` : "de rail";
  return [
    { rail: lang.nr, kant: "linksboven", tekst: `${welke}: de linkerbovenhoek van de eerste module` },
    { rail: lang.nr, kant: "rechtsboven", tekst: `${welke}: de rechterbovenhoek van de laatste module` },
    { rail: lang.nr, kant: "rechtsonder", tekst: `${welke}: de rechteronderhoek van de laatste module` },
    { rail: lang.nr, kant: "linksonder", tekst: `${welke}: de linkeronderhoek van de eerste module` },
    ...r.filter((x) => x !== lang).map((x) => ({ rail: x.nr, kant: "begin", tekst: `rail ${x.nr}: de linkerrand van de eerste module, op halve hoogte` })),
  ];
}

/**
 * De kaders op de foto uit de tikken (in de volgorde van tikStappen). Kast-
 * coördinaten: x in modules, y in modulehoogten (de langste rail van 0 tot 1).
 * @returns [{ i, groep, soort, leeg, hoeken: [[x,y]×4], midden: [x,y], modPx }] of [] als het (nog) niet kan
 */
export function projecteerKast(rails, tikken) {
  const r = rails.filter((x) => x.items && x.items.length);
  const st = tikStappen(rails);
  if (!st.length || !tikken || tikken.length < st.length) return [];
  const lang = r.find((x) => x.nr === st[0].rail);
  const W = Math.max(1, lang.breedte);
  const H = homografie([[0, 0], [W, 0], [W, 1], [0, 1]], tikken.slice(0, 4).map((t) => [t.x, t.y]));
  const Hi = H && omgekeerd(H);
  if (!H || !Hi) return [];
  // Per rail: waar hij op de kast begint (x) en waar zijn middenlijn ligt (y).
  const plaats = new Map([[lang.nr, { x: 0, y: 0.5 }]]);
  st.slice(4).forEach((s, k) => { const [x, y] = pasToe(Hi, tikken[4 + k].x, tikken[4 + k].y); plaats.set(s.rail, { x, y }); });
  const rond = (p) => p.map((v) => Math.round(v * 10) / 10);
  const uit = [];
  for (const rail of r) {
    const pl = plaats.get(rail.nr);
    for (const it of rail.items) {
      const x0 = pl.x + it.positie, x1 = x0 + it.breedte;
      const h = [pasToe(H, x0, pl.y - 0.5), pasToe(H, x1, pl.y - 0.5), pasToe(H, x1, pl.y + 0.5), pasToe(H, x0, pl.y + 0.5)].map(rond);
      const a = pasToe(H, x0, pl.y), b = pasToe(H, x0 + 1, pl.y);
      uit.push({ i: it.i, groep: it.groep, soort: it.soort, leeg: it.leeg, hoeken: h, midden: rond(pasToe(H, (x0 + x1) / 2, pl.y)), modPx: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
  }
  return uit;
}
