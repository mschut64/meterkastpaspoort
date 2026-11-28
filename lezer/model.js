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
 * De kam per aardlekblok (spec 4.3a). `al` is het volgnummer van de aardlek in
 * het indelingsblok; de lezer geeft de aardlekken in dezelfde leesvolgorde een
 * letter, dus die letter is de plek waar deze kam ligt. Zonder indeling is er
 * geen letter — dan staat het getal er wel, maar ongeplaatst.
 * @returns {{ al: number, letter: string, mm2: number|null, a: number|null }[]}
 */
export function kamPerBlok(p, m) {
  const lijst = Array.isArray(p && p.kamb) ? p.kamb.filter((k) => k && typeof k === "object") : [];
  const letters = (m && Array.isArray(m.rails) ? m.rails : []).flatMap((r) => r.items).filter((it) => it.letter).map((it) => it.letter);
  return lijst.map((k) => {
    const al = Number(k.al);
    return {
      al: Number.isInteger(al) && al >= 1 ? al : null,
      letter: Number.isInteger(al) && al >= 1 && letters[al - 1] ? letters[al - 1] : "",
      mm2: Number(k.mm2) > 0 ? Number(k.mm2) : null,
      a: Number(k.a) > 0 ? Number(k.a) : null,
    };
  });
}

/** De kam per blok in één regel, of "" als er niets staat. */
export function kamPerBlokTekst(p, m) {
  const delen = kamPerBlok(p, m).map((k) => {
    const wat = [k.mm2 ? `${komma(k.mm2)} mm²` : "", k.a ? `max ${komma(k.a)} A` : ""].filter(Boolean).join(" · ");
    if (!wat) return "";
    return k.letter ? `aardlek ${k.letter}: ${wat}` : k.al ? `blok ${k.al}: ${wat}` : wat;
  }).filter(Boolean);
  return delen.join(" — ");
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
    // Per blok, als de sticker dat draagt: in een kast met meer aardlekken heeft
    // elk blok vaak zijn eigen kamrail, en dan zegt één verdelergetal te weinig.
    ["Kam per blok", kamPerBlokTekst(p, m)],
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

// De warmteruimte uit de grondslag in woorden, of "" als zij er niet staat.
// Indicatie, geen temperatuurverificatie: de lezer zegt dat erbij.
function warmteZin(g) {
  const b = Number(g && g.pb), r = Number(g && g.pr);
  const heeftB = Number.isFinite(b) && b > 0;
  const heeftR = Number.isFinite(r);
  if (!heeftB && !heeftR) return "";
  if (heeftR && r < 0)
    return `Voor de warmte was er toen geen ruimte meer: het berekende verliesvermogen lag ${komma(Math.abs(r))} W boven wat deze kast kwijt kan${heeftB ? ` (${komma(b)} W)` : ""} — een indicatie, geen temperatuurverificatie.`;
  if (heeftR && heeftB)
    return `Voor de warmte bleef ${komma(r)} W over van de ${komma(b)} W die deze kast kwijt kan — een indicatie, geen temperatuurverificatie.`;
  if (heeftR) return `Voor de warmte bleef ${komma(r)} W over — een indicatie, geen temperatuurverificatie.`;
  return `Deze kast kan ${komma(b)} W aan warmte kwijt — een indicatie, geen temperatuurverificatie.`;
}

// ─── Voorbereid op: de reservering en haar grondslag (spec 4.11, 25-11-2026) ──
// Wat de installateur die de kast bouwde, vrijhield of al klaarzette voor een
// latere warmtepomp, laadpaal of thuisbatterij. Een intentie, geen garantie: de
// lezer toont het en zegt waarop het rustte, hij rekent niets na.
export const RES_NAAM = { wp: "Warmtepomp", lp: "Laadpaal", bat: "Thuisbatterij", pv: "Zonnepanelen", kook: "Koken", ov: "Overig" };
const komma = (v) => String(v).replace(".", ",");

/** "R1-9..11" → { rail: 1, van: 9, tot: 11 } (modules vanaf 1); null als het niet te lezen is. */
export function leesPos(pos) {
  const m = /^(?:V\d+)?R(\d+)-(\d+)(?:\.\.(\d+))?$/.exec(String(pos || "").trim());
  if (!m) return null;
  const rail = Number(m[1]), van = Number(m[2]), tot = m[3] ? Number(m[3]) : van;
  return van >= 1 && tot >= van ? { rail, van, tot } : null;
}

export function reserveringen(p) {
  const lijst = Array.isArray(p && p.res) ? p.res.filter((r) => r && typeof r === "object") : [];
  const res = lijst.map((r, k) => {
    const plek = leesPos(r.pos);
    const fasen = Array.isArray(r.fn) && r.fn.length ? (r.fn.length === 3 ? "3-fase" : `fase ${r.fn.map(String).join("+")}`) : r.f === 3 ? "3-fase" : r.f === 1 ? "1-fase" : "";
    const delen = [
      plek ? `rail ${plek.rail}, ${plek.van === plek.tot ? `module ${plek.van}` : `module ${plek.van} t/m ${plek.tot}`}` : (r.pos ? String(r.pos) : ""),
      Number(r.mod) > 0 ? `${r.mod} ${Number(r.mod) === 1 ? "module" : "modules"}` : "",
      fasen,
      Number(r.a) > 0 ? `${komma(r.a)} A` : "",
      Number(r.kw) > 0 ? `${komma(r.kw)} kW` : "",
    ].filter(Boolean);
    return { nr: k + 1, t: String(r.t || ""), naam: RES_NAAM[r.t] || (r.t ? String(r.t) : "Uitbreiding"), plek, tekst: delen.join(" · "), toelichting: r.n ? String(r.n) : "" };
  });
  const g = p && p.grond && typeof p.grond === "object" ? p.grond : null;
  let grond = "";
  if (g) {
    const delen = [
      Number(g.ha) > 0 ? `hoofdaansluiting ${komma(g.ha)} A` : "",
      Number(g.kam) > 0 ? `kam ${komma(g.kam)} A` : "",
      Number(g.gl) > 0 ? `gelijktijdigheid ${komma(g.gl)}` : "",
    ].filter(Boolean);
    grond = [
      `Gebaseerd op${g.d ? ` de berekening van ${g.d}` : " een berekening"}${delen.length ? `: ${delen.join(", ")}` : ""}.`,
      Number(g.rest) >= 0 && g.rest !== undefined && g.rest !== null && g.rest !== "" ? `Toen bleef ${komma(g.rest)} A over op de zwaarst belaste fase.` : "",
      // De warmtehuishouding (spec 4.11, velden pb/pr). `rest` zegt hoeveel
      // ampère er over is; dat is de halve vraag. Een laadpunt, PV of een
      // thuisbatterij is continu belast en past daarom lang niet altijd in de
      // warmtebalans, ook niet als er modules vrij zijn en de hoofdzekering het
      // aankan. Een negatieve `pr` betekent dat het berekende verlies er al
      // boven zit — dat moet als zodanig gelezen worden, niet als "0 over".
      warmteZin(g),
      g.door ? `Berekend door ${String(g.door)}.` : "",
    ].filter(Boolean).join(" ");
  }
  return { lijst: res, grond };
}
