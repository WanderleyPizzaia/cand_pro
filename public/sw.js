// Service worker mínimo do CAND PRO.
// Objetivo: habilitar a instalação do PWA (Chrome/Android exige um SW com
// handler de fetch) e dar um fallback básico quando offline.
// Estratégia: network-first; em falha de rede, tenta o cache.

const CACHE = "candpro-v1";
const PRECACHE = ["/icons/candpro.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só lida com GET de mesma origem; o resto segue direto pra rede.
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  // NUNCA intercepta APIs/downloads/streams (ex.: export CSV) — deixa a rede
  // cuidar. Interceptar isso quebrava o download e gerava erros no console.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Guarda uma cópia de respostas estáticas (icons/assets) pra uso offline.
        if (res.ok && req.url.includes("/icons/")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      // Falha de rede: tenta o cache; se não houver, devolve um Response válido
      // (nunca `undefined`, que gerava "Failed to convert value to 'Response'").
      .catch(async () => (await caches.match(req)) || Response.error())
  );
});
