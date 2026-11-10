/* ============================================================
   Service Worker — Mi Biblioteca
   Permite que la app funcione sin conexión (PWA).
   - La app (HTML) usa "red primero": si hay internet, trae lo último;
     si no, usa la copia guardada.
   - Las librerías y recursos pesados usan "caché primero".
   Sube el número de versión (CACHE) cuando cambies la app para que
   los celulares reciban la actualización.
   ============================================================ */
const CACHE = "biblioteca-v1";

// Recursos que se guardan al instalar (el "esqueleto" de la app).
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js",
];

// Orígenes cuyos recursos sí guardamos en caché al vuelo (librerías y fuentes).
const RUNTIME_HOSTS = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll falla si UN recurso falla; por eso los agregamos tolerando errores.
      Promise.allSettled(PRECACHE.map((u) => c.add(u)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// La página puede pedir activar de inmediato la versión nueva.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNav = req.mode === "navigate" ||
                (sameOrigin && (url.pathname.endsWith("/") || url.pathname.endsWith(".html")));

  // 1) La app (HTML): RED PRIMERO, con respaldo en caché si no hay internet.
  if (isNav) {
    e.respondWith(
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
        return resp;
      }).catch(() =>
        caches.match(req).then((r) => r || caches.match("./index.html") || caches.match("./"))
      )
    );
    return;
  }

  // 2) Librerías/fuentes/recursos propios: CACHÉ PRIMERO, y si no, red (y se guarda).
  const cacheable = sameOrigin || RUNTIME_HOSTS.includes(url.hostname);
  if (cacheable) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((resp) => {
          if (resp && (resp.ok || resp.type === "opaque")) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        });
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 3) Todo lo demás (APIs de Google/Dropbox/Telegram/Open Library): red normal,
  //    sin caché. Si no hay internet, simplemente falla como siempre.
});
