/* =============================================================
 *  Service Worker — PWA offline real (sin librerías)
 *
 *  Objetivo: que la app ABRA y funcione SIN conexión. Cachea el app shell
 *  (rutas y assets) con estrategia stale-while-revalidate: sirve al instante
 *  desde caché y revalida en segundo plano. Si una navegación no está en
 *  caché y no hay red, cae a la página /offline.
 *
 *  Datos del grupo/miembros/alertas viven en localStorage (lib/cache.ts), así
 *  que leer el grupo, ver alertas y componer mensajes funciona offline una vez
 *  visitadas las pantallas (quedan cacheadas aquí).
 *
 *  Versionado: sube CACHE_VERSION para invalidar cachés viejas en 'activate'.
 * ============================================================= */

const CACHE_VERSION = "rx-shell-v1";

// App shell mínimo: rutas principales + fallback offline + manifest.
// Se precachea en install con allSettled para que un fallo aislado no aborte.
const APP_SHELL = [
  "/",
  "/offline",
  "/grupos/mi",
  "/grupos/crear",
  "/grupos/unirse",
  "/alertas/nueva",
  "/leer",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca cacheamos POST/PUT (van a Supabase)

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // deja pasar terceros (Supabase, mapas)

  // Navegaciones (documentos) → SWR con fallback /offline.
  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(event, true));
    return;
  }

  // Assets same-origin (_next/static, css, js, manifest) → SWR.
  event.respondWith(staleWhileRevalidate(event, false));
});

// Stale-while-revalidate: responde de caché si existe y revalida en segundo
// plano; si no hay caché, espera la red; si tampoco hay red, cae a /offline
// (solo navegaciones).
async function staleWhileRevalidate(event, isNavigation) {
  const { request } = event;
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request)
    .then((response) => {
      // Solo cacheamos respuestas válidas same-origin (type 'basic').
      if (response && response.status === 200 && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(fetchAndUpdate); // revalida sin bloquear la respuesta
    return cached;
  }

  const fresh = await fetchAndUpdate;
  if (fresh) return fresh;

  if (isNavigation) {
    return (await cache.match("/offline")) || (await cache.match("/")) || Response.error();
  }
  return Response.error();
}
