// Hergebruik: een nieuw paspoort samenvoegen met het gescande, zonder iets van een ander te wissen.
// (Deel van mkp.js; letterlijk verplaatst op 17-11-2026, zie mkp.js voor het geheel.)

import { _isObj, _kopie } from "./hulp.js";

// ─── Hergebruik van een bestaand paspoort ───────────────────────────────────
//
// Lezers negeren wat ze niet kennen (ontwerpprincipe 4). Voor SCHRIJVERS geldt
// de keerzijde: wie een bestaand paspoort hergebruikt, geeft door wat hij niet
// begrijpt. Een installateur die een laadpaal bijplaatst mag de materiaallijst,
// de erkenning, de zegels en de handtekeningen van zijn voorganger niet wissen —
// en zonder deze functie gebeurt precies dat, stil: de app bouwt een nieuw
// paspoort uit wat zij zelf kent, en alles daarbuiten verdwijnt zonder
// foutmelding. Zie claude_paspoortbehoud-featurespec.md.
//
//   bron   het gescande, onbewerkte paspoort (of null bij een nieuwe kast)
//   nieuw  wat de app zelf opbouwt: de velden die zij beheert
//
// Regels:
//   · alles uit de bron blijft staan, ook onbekende velden, tot op elke diepte;
//   · de velden die de app aanlevert winnen;
//   · grp[]: de app bouwt de lijst op, maar per groep blijven de sleutels van de
//     bijbehorende bronregel staan die de app niet aanlevert (vooral fn en mat).
//     Koppelen op t + n als beide bestaan, anders op positie — maar nooit twee
//     groepen van een verschillend type aan elkaar: een laadpaal die het
//     fasenummer van een kookgroep erft is erger dan een ontbrekend fasenummer;
//   · mat[]: levert de app een eigen materiaallijst, dan wordt die per toestel
//     gekoppeld aan de bron op plaats (pos) + soort (s), en alleen als fabrikant
//     en type niet botsen. Bij een koppeling blijven de velden van de bron staan
//     die de app niet kent (art, sn, pd …). Een bronregel op een plaats waar de
//     app nu een ánder toestel ziet, vervalt — dat toestel is vervangen. Een
//     bronregel die de app niet ziet, blijft staan: een gemiste terugroepactie
//     is erger dan een melding die ter plekke wordt nagekeken. Daarna worden de
//     volgnummers (i) opnieuw uitgedeeld en alle grp[].mat mee omgezet;
//   · log[] is historie en wordt nooit herschreven. Nieuwe regels komen bovenaan;
//     bestaande regels blijven byte-voor-byte zoals in de bron, inclusief erk,
//     zeg, sid en sig — ook als de app een gewijzigde kopie aanlevert;
//   · v gaat nooit omlaag.

function _voegObjectSamen(bron, nieuw) {
  const uit = _isObj(bron) ? _kopie(bron) : {};
  for (const [k, w] of Object.entries(nieuw || {})) {
    if (w === undefined) continue;
    uit[k] = _isObj(w) && _isObj(uit[k]) ? _voegObjectSamen(uit[k], w) : _kopie(w);
  }
  return uit;
}

function _koppelGroepen(bronGrp, nieuwGrp) {
  const bron = Array.isArray(bronGrp) ? bronGrp : [];
  const gebruikt = new Set();
  const koppeling = new Array(nieuwGrp.length).fill(-1);
  // Eerst alle zekere koppelingen op type + omschrijving, zodat een koppeling op
  // positie nooit een bronregel wegkaapt die elders een echte treffer had.
  nieuwGrp.forEach((g, i) => {
    if (!g || !g.t || !g.n) return;
    const j = bron.findIndex((b, k) => !gebruikt.has(k) && b && b.t === g.t && b.n === g.n);
    if (j >= 0) { koppeling[i] = j; gebruikt.add(j); }
  });
  nieuwGrp.forEach((g, i) => {
    if (koppeling[i] >= 0 || (g && g.t && g.n) || i >= bron.length || gebruikt.has(i)) return;
    const b = bron[i];
    if (g && b && g.t && b.t && g.t !== b.t) return;   // ander type: niet koppelen
    koppeling[i] = i; gebruikt.add(i);
  });
  return nieuwGrp.map((g, i) => (koppeling[i] >= 0 ? _voegObjectSamen(bron[koppeling[i]], g) : _kopie(g)));
}

// Materiaal van de app en van de bron samenvoegen tot één lijst met nieuwe
// volgnummers. Geeft een kopie van bron en nieuw terug waarin mat[] de
// samengevoegde lijst is en elke grp[].mat naar het nieuwe nummer wijst.
function _voegMatSamen(bronIn, nieuwIn) {
  const bron = _kopie(bronIn), nieuw = _kopie(nieuwIn);
  const bm = Array.isArray(bron.mat) ? bron.mat.filter(_isObj) : [];
  const nm = nieuw.mat.filter(_isObj);
  const gelijk = (a, b) => !a || !b || String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const gebruikt = new Set();
  const plaatsNieuw = new Set(nm.map((m) => m.pos).filter(Boolean));
  const uit = [], vanNieuw = new Map(), vanBron = new Map();

  for (const m of nm) {
    const j = m.pos ? bm.findIndex((b, k) => !gebruikt.has(k) && b.pos === m.pos && b.s === m.s && gelijk(b.fab, m.fab) && gelijk(b.typ, m.typ)) : -1;
    const regel = j >= 0 ? _voegObjectSamen(bm[j], m) : _kopie(m);
    regel.i = uit.length + 1;
    if (m.i !== undefined) vanNieuw.set(m.i, regel.i);
    if (j >= 0) { gebruikt.add(j); if (bm[j].i !== undefined) vanBron.set(bm[j].i, regel.i); }
    uit.push(regel);
  }
  bm.forEach((b, k) => {
    if (gebruikt.has(k) || (b.pos && plaatsNieuw.has(b.pos))) return;   // vervangen toestel vervalt
    const regel = _kopie(b); regel.i = uit.length + 1;
    if (b.i !== undefined) vanBron.set(b.i, regel.i);
    uit.push(regel);
  });

  const zetOm = (grpLijst, kaart) => {
    for (const g of Array.isArray(grpLijst) ? grpLijst : []) {
      if (!_isObj(g) || !("mat" in g)) continue;
      if (kaart.has(g.mat)) g.mat = kaart.get(g.mat); else delete g.mat;
    }
  };
  zetOm(nieuw.grp, vanNieuw);
  zetOm(bron.grp, vanBron);
  delete bron.mat;
  nieuw.mat = uit;
  return { bron, nieuw };
}

function _voegLogSamen(bronLog, nieuwLog) {
  const bron = Array.isArray(bronLog) ? bronLog : [];
  // Een regel is "dezelfde" als datum, bedrijf en omschrijving gelijk zijn. Levert
  // de app een bestaande regel aan — eventueel zonder de velden die zij niet kent —
  // dan telt de bronversie, zodat een handtekening nooit ongemerkt wegvalt.
  const sleutel = (r) => JSON.stringify([r && r.d, r && r.b, r && r.w]);
  const bekend = new Set(bron.map(sleutel));
  const nieuweRegels = (Array.isArray(nieuwLog) ? nieuwLog : []).filter((r) => !bekend.has(sleutel(r)));
  return [...nieuweRegels.map(_kopie), ...bron.map(_kopie)];
}

export function mkpSamenvoegen(bron, nieuw) {
  // Geen of onbruikbare bron: gedraag je precies als zonder hergebruik. Een
  // beschadigde import mag nooit de hele klus laten mislukken.
  if (!_isObj(bron)) return _kopie(nieuw || {});
  let n = nieuw || {};
  if (Array.isArray(n.mat)) {
    const m = _voegMatSamen(bron, n);
    bron = m.bron; n = m.nieuw;
  }
  const { grp, log, ...rest } = n;
  const uit = _voegObjectSamen(bron, rest);
  if (Array.isArray(grp)) uit.grp = _koppelGroepen(bron.grp, grp);
  if (Array.isArray(uit.mat) && Array.isArray(uit.grp)) {
    const bestaat = new Set(uit.mat.map((x) => x && x.i));
    for (const g of uit.grp) if (_isObj(g) && "mat" in g && !bestaat.has(g.mat)) delete g.mat;
  }
  if (Array.isArray(log) || Array.isArray(bron.log)) uit.log = _voegLogSamen(bron.log, log);
  const vb = typeof bron.v === "number" ? bron.v : 1, vn = typeof n.v === "number" ? n.v : 1;
  uit.v = Math.max(vb, vn);
  return uit;
}
