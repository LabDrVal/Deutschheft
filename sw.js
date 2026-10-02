// Deutschheft offline support: keeps a copy of the app on the iPad so it opens without internet.
// Your journal itself is stored separately (in the app's database), not here.
const CACHE = "deutschheft-app-v3";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("deutschheft-app-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;               // Gemini and LanguageTool calls go straight to the internet
  const url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
  else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") event.respondWith(cacheFirst(req));
});

// Online: get the newest version (so updates arrive). Offline or slow: use the saved copy.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req.url, {signal: ctrl.signal, cache: "no-cache"});
    clearTimeout(timer);
    if (res.ok) {
      await cache.put(req.url, res.clone());
      if (req.mode === "navigate") await cache.put(new URL("./", self.registration.scope).href, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req.url, {ignoreSearch: true})
      || (req.mode === "navigate" && (await cache.match("./index.html") || await cache.match("./")));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); cache.put(req, res.clone()); return res; }
  catch (err) { return new Response("", {status: 504}); }
}
