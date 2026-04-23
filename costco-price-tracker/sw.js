// Service worker for Costco Price Tracker.
// Handles Periodic Background Sync (where supported) to trigger a daily
// price check. It asks the open page to perform the check; if no page is
// open, it skips silently (real fetches need app code + proxy config).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('periodicsync', (event) => {
	if (event.tag === 'costco-price-check') {
		event.waitUntil(runCheck());
	}
});

async function runCheck() {
	const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const c of clients) {
		c.postMessage({ type: 'run-price-check' });
	}
	// If no window is open we can't do much from the SW alone because
	// Costco requires a CORS proxy configured in the page settings and
	// localStorage-backed receipt state lives in the page context.
}
