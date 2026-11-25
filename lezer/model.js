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
    for (const t of u.toestellen) {
      if (t.soort === "railscheiding") { uit.rails.push(rail); rail = { nr: rail.nr + 1, items: [], breedte: 0 }; continue; }
      const breedte = t.breedte || 1;
      const groep = Number.isInteger(t.groep) && t.groep >= 1 ? t.groep : null;
      const g = groep && grp[groep - 1] ? grp[groep - 1] : null;
      const letter = t.soort === "aardlek" ? String.fromCharCode(65 + (letters++ % 26)) : null;
      rail.items.push({
        i: n++, soort: t.soort, leeg: t.soort === "leeg", breedte, positie: rail.breedte, rail: rail.nr,
        letter,
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
 * De sticker legt niet vast achter welke aardlek een groep hangt (de kam is niet
 * te zien, en aardlekken staan vaak bij elkaar op één rail). Alleen bij een
 * aardlekautomaat is het zeker: die is zijn eigen aardlek. Anders blijft het
 * veld leeg — op papier om met de hand in te vullen. Nooit afleiden uit de plaats.
 */
export function groepenVerklaring(m) {
  const items = m.rails.flatMap((r) => r.items);
  const aardlekken = items.filter((it) => it.letter).map((it) => ({ letter: it.letter, bev: it.bev, rail: it.rail }));
  const regels = m.groepen.map((g) => {
    const it = items.find((x) => x.groep === g.nr) || null;
    let aardlek = "";
    if (it && it.soort === "aardlekautomaat") aardlek = `eigen (aardlekautomaat${it.bev.includes("mA") ? `, ${it.bev.split(" · ").filter((d) => /mA|type/.test(d)).join(" ")}` : ""})`;
    return {
      nr: g.nr, naam: g.naam || g.type || "", type: g.naam ? g.type : "", fase: g.fase,
      aardlek, stroom: it && it.bev ? it.bev.split(" · ")[0] : "", inTekening: !!it, onderverdeler: g.onderverdeler,
    };
  });
  return { regels, aardlekken, gekoppeld: regels.some((r) => r.inTekening) };
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
 * De tekst per positie voor een labelstrook van `perStrook` modules. Een toestel
 * hoort bij de strook waarop het begint; past het er niet meer bij, dan begint
 * een nieuwe strook. Lege plaatsen tellen mee, met lege tekst.
 */
export function labelStroken(m, perStrook = 4) {
  const stroken = [];
  for (const r of m.rails) {
    let s = null;
    for (const it of r.items) {
      if (!s || (s.modules + it.breedte > perStrook && s.posities.length)) { s = { rail: r.nr, vanaf: it.positie, modules: 0, posities: [] }; stroken.push(s); }
      s.posities.push({ positie: it.positie, breedte: it.breedte, leeg: it.leeg,
        groep: it.groep, naam: it.naam, kort: it.kort,
        // Bij een aardlek hoort het type erbij ("30 mA A"); anders alleen de beveiliging ("B16").
        bev: /^aardlek/.test(it.soort) ? it.bev.split(" · ").join(" ").replace("type ", "") : (it.bev.split(" · ")[0] || "") });
      s.modules += it.breedte;
    }
  }
  return stroken;
}
