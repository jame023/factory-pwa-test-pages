const CACHE_NAME = "factory-pwa-shell-v1.3.181";
const APP_SHELL = [
  "./pages/production-record/index.js",
  "./pages/ot/index.js",
  "./components/action-popup.js",
  "./js/live-updates.js",
  "./js/notification-read-state.js",
  "./js/attendance-data.js",
  "./assets/icons/sip-logo.png", "./assets/icons/apple-touch-icon.png", "./assets/icons/factory-maskable-512.png",
  "./js/directory-snapshot.js",
  "./js/leave-media.js",
  "./pages/leave/approved-calendar.js",
  "./assets/previews/leave-notice-pending.svg", "./assets/previews/leave-notice-approved.svg",
  "./assets/previews/leave-notice-rejected.svg", "./assets/previews/leave-notice-cancelled.svg",
  "./js/report-inbox.js", "./pages/reports/local-summary.js",
  "./js/business-rules.js", "./js/business-request.js",
  "./js/leave-rules.js",
  "./js/notifications.js",
  "./pages/work-session/manager.js",
  "./js/manager-attendance-fixture.js", "./pages/attendance/manager.js",
  "./js/machine-admin-repository.js", "./js/item-name-admin-repository.js", "./js/active-item-names.js", "./js/machine-admin-auth.js", "./js/pkce-oauth.js", "./pages/admin/machines.js", "./pages/admin/item-names.js", "./components/status-modal.js",
  "./", "./index.html", "./offline.html", "./manifest.webmanifest",
  "./css/app.css", "./assets/icons/factory-192.png", "./assets/icons/factory-512.png",
  "./js/app.js", "./js/auth.js", "./js/api.js", "./js/config.js", "./js/supabase-app-api.js", "./js/supabase-employee-repository.js", "./js/offline.js",
  "./js/router.js", "./js/state.js", "./js/utils.js",
  "./js/permissions.js", "./js/record-schema.js", "./js/mock-api.js",
  "./js/attendance-contract.js", "./js/attendance-fixture.js", "./js/read-only-api.js",
  "./components/app-card.js", "./components/app-header.js", "./components/login-screen.js", "./components/bottom-nav.js",
  "./components/loading.js", "./components/modal.js", "./components/toast.js", "./components/status-modal.js",
  "./adapters/package01.js", "./adapters/package03.js", "./adapters/package04.js",
  "./adapters/package05.js", "./adapters/package06.js", "./adapters/package07.js",
  "./adapters/package08.js", "./adapters/package09.js", "./adapters/package10.js",
  "./adapters/package11.js",
  "./pages/home/index.js", "./pages/attendance/index.js", "./pages/work-session/index.js",
  "./pages/leave/index.js", "./pages/calendar/index.js", "./pages/delivery/index.js",
  "./pages/production/index.js", "./pages/reports/index.js",
  "./pages/admin/index.js"
];
APP_SHELL.push("./js/router.js?v=1.3.179", "./js/offline.js?v=1.3.179", "./js/config.js?v=1.3.179", "./js/permissions.js?v=1.3.179", "./components/action-popup.js?v=1.3.179", "./pages/home/index.js?v=1.3.179", "./adapters/package07.js?v=1.3.179", "./adapters/package09.js?v=1.3.179", "./adapters/package10.js?v=1.3.179", "./js/api.js?v=1.3.179", "./js/supabase-app-api.js?v=1.3.180", "./js/auth.js?v=1.3.180", "./js/record-schema.js?v=1.3.180", "./js/utils.js?v=1.3.180", "./js/config.js?v=1.3.181", "./js/app.js?v=1.3.181", "./js/router.js?v=1.3.181", "./js/offline.js?v=1.3.181", "./js/permissions.js?v=1.3.181", "./components/action-popup.js?v=1.3.181", "./pages/home/index.js?v=1.3.181", "./adapters/package07.js?v=1.3.181", "./adapters/package09.js?v=1.3.181", "./adapters/package10.js?v=1.3.181", "./js/api.js?v=1.3.181", "./js/supabase-app-api.js?v=1.3.181", "./js/record-schema.js?v=1.3.181", "./js/utils.js?v=1.3.181");
const shellUrls = new Set(APP_SHELL.map(asset => new URL(asset, self.location.href).href));
self.addEventListener("install", event => {
  event.waitUntil((async () => { const cache = await caches.open(CACHE_NAME); const requests = APP_SHELL.map(asset => new Request(new URL(asset, self.location.href), { cache: "reload" })); await cache.addAll(requests); })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("factory-pwa-shell-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  // Request.url can retain #/route. Fragments are client navigation, not server inputs.
  const url = new URL(request.url);
  url.hash = "";
  const shellKey = url.href;
  // Explicit static allowlist: API responses and unknown/query URLs never touch cache.
  if (request.method !== "GET" || !shellUrls.has(shellKey)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match(shellKey)) || (await caches.match("./index.html")) ||
          (await caches.match("./offline.html"));
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(shellKey);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(shellKey, response.clone());
      }
      return response;
    } catch {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});










