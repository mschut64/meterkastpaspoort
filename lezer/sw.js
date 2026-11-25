// Service worker van de meterkastpaspoort-lezer: zodat hij werkt in een kelder
// zonder bereik. Bewaart alleen de lezer, de codec en de sleutellijst; geen
// paspoorten (die staan in de link) en niets van de gebruiker.
const CACHE = "mkp-lezer-v4";
const BESTANDEN = [
  "/lezer/", "/lezer/index.html", "/lezer/lezer.js", "/lezer/model.js", "/lezer/manifest.webmanifest", "/lezer/vendor/jsqr.min.js", "/lezer/verklaring.js", "/lezer/foto.js", "/lezer/vendor/qrcode.min.js",
  "/mkp.js", "/codec/afkappen.js", "/codec/coderen.js", "/codec/controleren.js", "/codec/ean.js", "/codec/hulp.js",
  "/codec/indeling-tabellen.js", "/codec/indeling.js", "/codec/materiaal.js", "/codec/meetwaarden.js", "/codec/profielen.js",
  "/codec/qr.js", "/codec/registers.js", "/codec/samenvoegen.js", "/codec/teksten.js", "/codec/v04.js", "/codec/versie.js",
  "/veldnotities/index.json",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(BESTANDEN.map((b) => c.add(b)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("mkp-lezer-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Eerst het netwerk (dan is een nieuwe versie er meteen), en zonder bereik de cache.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const pad = u.pathname === "/lezer" ? "/lezer/" : u.pathname;
  if (!BESTANDEN.includes(pad)) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const kopie = r.clone(); caches.open(CACHE).then((c) => c.put(pad, kopie)); }
    return r;
  }).catch(() => caches.match(pad, { ignoreSearch: true }).then((r) => r || caches.match("/lezer/index.html"))));
});
