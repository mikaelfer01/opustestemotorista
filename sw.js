/* Service Worker — OPUS Entregas (app do motorista)
   Só cuida do "app shell" (a própria página, ícones, manifest).
   Dados de rota/entrega continuam sempre vindos do Firebase pela rede —
   isso aqui garante que o app abra rápido e instale de verdade,
   mesmo com internet fraca no início.
*/
const CACHE_NAME = "opus-motorista-shell-v1";
const SHELL_FILES = [
  "/motorista.html",
  "/manifest-motorista.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("motorista.html") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/motorista.html");
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só cuidamos de requisições GET, mesma origem, dos arquivos do app shell.
  // Tudo o mais (Firebase, APIs, mapas, tiles) vai direto pra rede, sem interceptar.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  const isShellFile =
    url.pathname === "/motorista.html" ||
    url.pathname === "/manifest-motorista.webmanifest" ||
    url.pathname.startsWith("/icons/");

  if (!isShellFile) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
