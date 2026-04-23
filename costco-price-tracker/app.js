(() => {
'use strict';

// ---------- Storage ----------

const STORAGE_KEY = 'costco-price-tracker/receipts';
const SETTINGS_KEY = 'costco-price-tracker/settings';
const ADJUSTMENT_WINDOW_DAYS = 30;

const loadReceipts = () => {
	try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
	catch { return []; }
};
const saveReceipts = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));

const loadSettings = () => {
	try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
	catch { return {}; }
};
const saveSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

// ---------- DOM helpers ----------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const el = (tag, props = {}, ...children) => {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') n.className = v;
		else if (k === 'dataset') Object.assign(n.dataset, v);
		else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
		else if (v !== null && v !== undefined) n.setAttribute(k, v);
	}
	for (const c of children) {
		if (c == null) continue;
		n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return n;
};

const notice = (msg) => {
	$('#notice-msg').textContent = msg;
	$('#notice').classList.remove('hidden');
};
$('#notice [data-dismiss-notice]').addEventListener('click', () =>
	$('#notice').classList.add('hidden'));

const fmtMoney = (n) => n == null || isNaN(n) ? '—' : '$' + Number(n).toFixed(2);
const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Receipt parser ----------

// Costco receipt format varies, but typical line items look like:
//   E 1234567 KIRKLAND CHIA    12.99 Y
//   1234567 PAPER TOWEL    19.99 N
// Discount lines are often "1234567/2.00-" or " /3.00-" directly below.
// Dates appear as MM/DD/YYYY or similar.
function parseReceipt(rawText) {
	const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

	let purchaseDate = null;
	const dateRe = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;
	for (const l of lines) {
		const m = l.match(dateRe);
		if (m) {
			let [, mo, d, y] = m;
			if (y.length === 2) y = (Number(y) < 70 ? '20' : '19') + y;
			const iso = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
			if (!isNaN(new Date(iso).getTime())) { purchaseDate = iso; break; }
		}
	}

	let warehouse = null;
	for (const l of lines) {
		const m = l.match(/(?:warehouse|store)\s*#?\s*(\d{1,4})/i);
		if (m) { warehouse = m[1]; break; }
	}

	// Item lines: a numeric item code (5-7 digits), some description, then a price at the end.
	const itemRe = /^(?:E\s+)?(\d{5,7})\s+(.+?)\s+(\d+\.\d{2})(?:\s*[A-Z])?$/;
	// Discount line: maybe "/  2.00-" or "1234567/ 2.00-" or "TPD/ 2.00-"
	const discountRe = /^(?:\d{5,7}\/|\/|TPD\/?)\s*(\d+\.\d{2})-?$/i;

	const items = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Stop parsing once we hit totals section
		if (/^(subtotal|tax|total|amount|tend|change|visa|debit|master)/i.test(line)) break;

		const m = line.match(itemRe);
		if (m) {
			const [, code, desc, price] = m;
			const item = {
				id: uid(),
				code,
				description: desc.replace(/\s+/g, ' ').trim(),
				paid: Number(price),
				discountedAtPurchase: false,
				track: true,
			};
			// Check next line for a discount applied to this item
			const next = lines[i + 1];
			if (next) {
				const dm = next.match(discountRe);
				if (dm) {
					item.discountedAtPurchase = true;
					item.track = false;
					item.originalPrice = item.paid + Number(dm[1]);
					i++; // consume the discount line
				}
			}
			items.push(item);
		}
	}
	return { purchaseDate, warehouse, items };
}

// ---------- OCR ----------

let currentImage = null;

$('#receipt-file').addEventListener('change', (e) => {
	const f = e.target.files[0];
	currentImage = f || null;
	$('#scan-btn').disabled = !f;
});

$('#scan-btn').addEventListener('click', async () => {
	if (!currentImage) return;
	$('#scan-progress').classList.remove('hidden');
	$('#scan-bar').style.width = '0%';
	$('#scan-status').textContent = 'Loading OCR engine…';
	try {
		const { data } = await Tesseract.recognize(currentImage, 'eng', {
			logger: (m) => {
				if (m.status) $('#scan-status').textContent = m.status;
				if (typeof m.progress === 'number')
					$('#scan-bar').style.width = Math.round(m.progress * 100) + '%';
			},
		});
		$('#ocr-raw-text').value = data.text;
		$('#ocr-raw').classList.remove('hidden');
		const parsed = parseReceipt(data.text);
		showReview(parsed);
		$('#scan-status').textContent = 'Done.';
	} catch (err) {
		$('#scan-status').textContent = 'OCR failed: ' + err.message;
	}
});

$('#reparse-btn').addEventListener('click', () => {
	const parsed = parseReceipt($('#ocr-raw-text').value);
	showReview(parsed);
});

$('#manual-btn').addEventListener('click', () => {
	showReview({ purchaseDate: new Date().toISOString().slice(0, 10), warehouse: '', items: [] });
});

// ---------- Review / save ----------

function showReview({ purchaseDate, warehouse, items }) {
	$('#review-section').classList.remove('hidden');
	$('#purchase-date').value = purchaseDate || '';
	$('#warehouse').value = warehouse || '';
	const body = $('#items-body');
	body.innerHTML = '';
	if (items.length === 0) addItemRow();
	else items.forEach(addItemRow);
	$('#review-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addItemRow(item) {
	item = item || { id: uid(), code: '', description: '', paid: 0, discountedAtPurchase: false, track: true };
	const tr = el('tr', { dataset: { id: item.id } },
		el('td', { class: 'num', 'data-label': 'Item #' },
			el('input', { type: 'text', value: item.code || '', 'data-field': 'code' })),
		el('td', { 'data-label': 'Description' },
			el('input', { type: 'text', value: item.description || '', 'data-field': 'description' })),
		el('td', { class: 'paid', 'data-label': 'Paid' },
			el('input', { type: 'number', step: '0.01', value: item.paid || '', 'data-field': 'paid' })),
		el('td', { class: 'center', 'data-label': 'Discounted?' },
			el('input', { type: 'checkbox', 'data-field': 'discountedAtPurchase', ...(item.discountedAtPurchase ? { checked: 'checked' } : {}) })),
		el('td', { class: 'center', 'data-label': 'Track' },
			el('input', { type: 'checkbox', 'data-field': 'track', ...(item.track ? { checked: 'checked' } : {}) })),
		el('td', { class: 'center' },
			el('button', { type: 'button', class: 'danger-btn', onclick: (e) => e.target.closest('tr').remove() }, '×'))
	);
	$('#items-body').appendChild(tr);
}

$('#add-item-btn').addEventListener('click', () => addItemRow());
$('#cancel-review-btn').addEventListener('click', () => $('#review-section').classList.add('hidden'));

$('#save-receipt-btn').addEventListener('click', () => {
	const purchaseDate = $('#purchase-date').value;
	if (!purchaseDate) { notice('Please set a purchase date.'); return; }
	const items = $$('#items-body tr').map(tr => {
		const get = (f) => tr.querySelector(`[data-field="${f}"]`);
		return {
			id: tr.dataset.id,
			code: get('code').value.trim(),
			description: get('description').value.trim(),
			paid: Number(get('paid').value) || 0,
			discountedAtPurchase: get('discountedAtPurchase').checked,
			track: get('track').checked,
			priceHistory: [],
		};
	}).filter(i => i.description || i.code);

	if (items.length === 0) { notice('Add at least one item before saving.'); return; }

	const receipt = {
		id: uid(),
		purchaseDate,
		warehouse: $('#warehouse').value.trim(),
		createdAt: Date.now(),
		items,
	};
	const all = loadReceipts();
	all.unshift(receipt);
	saveReceipts(all);
	$('#review-section').classList.add('hidden');
	$('#receipt-file').value = '';
	currentImage = null;
	$('#scan-btn').disabled = true;
	renderReceipts();
	notice('Receipt saved. Tracking begins now.');
});

// ---------- Render tracked receipts ----------

function receiptStatus(r) {
	const age = daysBetween(new Date(r.purchaseDate).getTime(), Date.now());
	return { age, daysLeft: ADJUSTMENT_WINDOW_DAYS - age, expired: age > ADJUSTMENT_WINDOW_DAYS };
}

function itemStatus(r, item) {
	if (item.discountedAtPurchase) return { cls: 'skipped', label: 'Was on discount' };
	if (!item.track) return { cls: 'skipped', label: 'Not tracked' };
	const { expired } = receiptStatus(r);
	if (expired) return { cls: 'expired', label: 'Window closed' };
	const latest = item.priceHistory && item.priceHistory[item.priceHistory.length - 1];
	if (latest && latest.price < item.paid - 0.004)
		return { cls: 'drop', label: `Drop: ${fmtMoney(latest.price)}` };
	return { cls: 'tracking', label: 'Tracking' };
}

function renderReceipts() {
	const all = loadReceipts();
	const list = $('#receipts-list');
	list.innerHTML = '';
	if (all.length === 0) {
		list.appendChild(el('p', { class: 'hint' }, 'No receipts yet. Scan one above to start.'));
		return;
	}
	all.forEach(r => list.appendChild(renderReceipt(r)));
}

function renderReceipt(r) {
	const { age, daysLeft, expired } = receiptStatus(r);
	const drops = r.items.filter(i => {
		const s = itemStatus(r, i);
		return s.cls === 'drop';
	});

	const head = el('div', { class: 'receipt-head' },
		el('h3', {}, `Receipt · ${r.purchaseDate}` + (r.warehouse ? ` · Store #${r.warehouse}` : '')),
		el('span', { class: 'receipt-meta' },
			expired ? `Window closed (${age}d ago)` : `${daysLeft} day${daysLeft === 1 ? '' : 's'} of 30 left`)
	);

	const actions = el('div', { class: 'receipt-actions' },
		el('button', { type: 'button', class: 'primary-btn', onclick: () => checkAllForReceipt(r.id) },
			expired ? 'Re-check (past window)' : 'Check prices now'),
		el('button', { type: 'button', class: 'text-btn', onclick: () => showAdjustmentSlip(r.id) },
			'Adjustment slip'),
		el('button', { type: 'button', class: 'danger-btn', onclick: () => {
			if (!confirm('Delete this receipt?')) return;
			saveReceipts(loadReceipts().filter(x => x.id !== r.id));
			renderReceipts();
		} }, 'Delete')
	);

	const items = el('ul', { class: 'receipt-items' });
	r.items.forEach(item => items.appendChild(renderItem(r, item)));

	const card = el('div', { class: 'receipt-card' }, head);
	if (drops.length > 0)
		card.appendChild(el('div', { class: 'drop-banner' },
			`${drops.length} price drop${drops.length === 1 ? '' : 's'} detected — eligible for in-store price adjustment.`));
	card.appendChild(actions);
	card.appendChild(items);
	return card;
}

function renderItem(r, item) {
	const s = itemStatus(r, item);
	const latest = item.priceHistory && item.priceHistory[item.priceHistory.length - 1];
	const priceText = latest
		? `Paid ${fmtMoney(item.paid)} · Latest ${fmtMoney(latest.price)}`
		: `Paid ${fmtMoney(item.paid)}`;

	const name = el('span', { class: 'item-name' },
		item.description + (item.code ? ` (#${item.code})` : ''));
	const prices = el('span', { class: 'item-prices' }, priceText);
	const status = el('span', { class: 'status ' + s.cls }, s.label);

	const row = el('li', {}, name, prices, status);

	if (item.track && !item.discountedAtPurchase && !receiptStatus(r).expired) {
		const search = el('button', { type: 'button', class: 'text-btn',
			onclick: () => openCostcoSearch(item) }, 'Open Costco search');
		const setPrice = el('button', { type: 'button', class: 'text-btn',
			onclick: () => promptNewPrice(r.id, item.id) }, 'Enter current price');
		row.appendChild(el('span', { class: 'item-actions' }, search, setPrice));
	}
	return row;
}

// ---------- Price check workflow ----------

function openCostcoSearch(item) {
	const q = encodeURIComponent(item.code && item.code.length >= 5 ? item.code : item.description);
	window.open(`https://www.costco.com/CatalogSearch?keyword=${q}`, '_blank', 'noopener');
}

function promptNewPrice(receiptId, itemId) {
	const all = loadReceipts();
	const r = all.find(x => x.id === receiptId);
	if (!r) return;
	const item = r.items.find(x => x.id === itemId);
	if (!item) return;
	const raw = prompt(`Current Costco price for "${item.description}"?\n(You paid ${fmtMoney(item.paid)}.)`);
	if (raw == null) return;
	const price = Number(String(raw).replace(/[^0-9.]/g, ''));
	if (!price || isNaN(price)) { notice('That price didn\'t look like a number.'); return; }
	recordPrice(receiptId, itemId, price, 'manual');
}

function recordPrice(receiptId, itemId, price, source) {
	const all = loadReceipts();
	const r = all.find(x => x.id === receiptId);
	if (!r) return;
	const item = r.items.find(x => x.id === itemId);
	if (!item) return;
	item.priceHistory = item.priceHistory || [];
	item.priceHistory.push({ price, source, at: Date.now() });
	saveReceipts(all);
	if (price < item.paid - 0.004) {
		maybeNotify(item, price, r);
	}
	renderReceipts();
}

async function checkAllForReceipt(receiptId) {
	const all = loadReceipts();
	const r = all.find(x => x.id === receiptId);
	if (!r) return;
	const proxy = loadSettings().proxyUrl;
	if (!proxy) {
		notice('No proxy configured — opening Costco searches in new tabs for each tracked item. Enter the current price you see for each.');
		r.items.filter(i => i.track && !i.discountedAtPurchase).forEach(openCostcoSearch);
		return;
	}
	notice('Checking prices via configured proxy…');
	for (const item of r.items) {
		if (!item.track || item.discountedAtPurchase) continue;
		try {
			const price = await fetchCostcoPrice(item, proxy);
			if (price != null) recordPrice(r.id, item.id, price, 'proxy');
		} catch (e) { /* ignore per-item failures */ }
	}
	notice('Price check complete.');
}

async function fetchCostcoPrice(item, proxyPrefix) {
	const q = item.code && item.code.length >= 5 ? item.code : item.description;
	const target = `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}`;
	const res = await fetch(proxyPrefix + encodeURIComponent(target));
	if (!res.ok) return null;
	const html = await res.text();
	// Heuristic: find the first price-like value ($ followed by number).
	// Real Costco pages render prices in JSON/scripts; this is a best-effort parser.
	const m = html.match(/"price"\s*:\s*"?\$?(\d+\.\d{2})/i)
		|| html.match(/\$(\d+\.\d{2})/);
	return m ? Number(m[1]) : null;
}

// ---------- Notifications ----------

function maybeNotify(item, newPrice, r) {
	const s = loadSettings();
	if (!s.notifyEnabled) return;
	if (!('Notification' in window) || Notification.permission !== 'granted') return;
	const saving = (item.paid - newPrice).toFixed(2);
	new Notification('Costco price drop', {
		body: `${item.description} is now ${fmtMoney(newPrice)} (you paid ${fmtMoney(item.paid)}, save $${saving}). ${receiptStatus(r).daysLeft} days left for price adjustment.`,
		tag: 'costco-' + item.id,
	});
}

$('#notify-toggle').addEventListener('change', async (e) => {
	if (e.target.checked) {
		if (!('Notification' in window)) { notice('This browser does not support notifications.'); e.target.checked = false; return; }
		const perm = await Notification.requestPermission();
		if (perm !== 'granted') { e.target.checked = false; notice('Notification permission denied.'); return; }
	}
	const s = loadSettings();
	s.notifyEnabled = e.target.checked;
	saveSettings(s);
});

$('#test-notify').addEventListener('click', () => {
	if (Notification.permission !== 'granted') { notice('Enable notifications first.'); return; }
	new Notification('Costco Price Tracker', { body: 'Notifications are working.' });
});

$('#proxy-url').addEventListener('change', (e) => {
	const s = loadSettings();
	s.proxyUrl = e.target.value.trim();
	saveSettings(s);
});

// ---------- Adjustment slip ----------

function showAdjustmentSlip(receiptId) {
	const r = loadReceipts().find(x => x.id === receiptId);
	if (!r) return;
	const drops = r.items
		.map(i => ({ i, latest: i.priceHistory && i.priceHistory[i.priceHistory.length - 1] }))
		.filter(x => x.latest && x.latest.price < x.i.paid - 0.004);
	const rows = drops.map(({ i, latest }) => {
		const save = (i.paid - latest.price).toFixed(2);
		return el('tr', {},
			el('td', {}, i.code || '—'),
			el('td', {}, i.description),
			el('td', {}, fmtMoney(i.paid)),
			el('td', {}, fmtMoney(latest.price)),
			el('td', {}, '$' + save)
		);
	});
	const { daysLeft, expired } = receiptStatus(r);
	const slip = el('div', { class: 'slip' },
		el('h3', {}, 'Costco Price Adjustment Request'),
		el('p', {}, `Purchase date: ${r.purchaseDate}` + (r.warehouse ? ` · Warehouse #${r.warehouse}` : '')),
		el('p', {}, expired
			? `NOTE: 30-day adjustment window has passed (${-daysLeft} day${-daysLeft === 1 ? '' : 's'} over).`
			: `Days remaining in 30-day window: ${daysLeft}`),
		drops.length === 0
			? el('p', {}, 'No price drops recorded on this receipt.')
			: el('table', {},
				el('thead', {}, el('tr', {},
					el('th', {}, 'Item #'), el('th', {}, 'Description'),
					el('th', {}, 'Paid'), el('th', {}, 'Current'), el('th', {}, 'Savings'))),
				el('tbody', {}, ...rows)),
		el('p', {}, `Total savings requested: $${drops.reduce((s, x) => s + (x.i.paid - x.latest.price), 0).toFixed(2)}`)
	);
	const content = $('#adjustment-content');
	content.innerHTML = '';
	content.appendChild(slip);
	$('#adjustment-section').classList.remove('hidden');
	$('#adjustment-section').scrollIntoView({ behavior: 'smooth' });
	$('#adjustment-section').dataset.receiptId = receiptId;
}

$('#close-slip').addEventListener('click', () => $('#adjustment-section').classList.add('hidden'));
$('#print-slip').addEventListener('click', () => window.print());

// ---------- Periodic background checks ----------

async function runDueChecks() {
	// Run a check on any receipt whose last check was > 24h ago and which is still in-window.
	const all = loadReceipts();
	const now = Date.now();
	let changed = false;
	for (const r of all) {
		if (receiptStatus(r).expired) continue;
		if (r.lastCheckedAt && now - r.lastCheckedAt < 86400000) continue;
		r.lastCheckedAt = now;
		changed = true;
		await checkAllForReceipt(r.id);
	}
	if (changed) saveReceipts(all);
}

async function initBackgroundSync() {
	const statusEl = $('#bg-sync-status');
	if (!('serviceWorker' in navigator)) {
		statusEl.textContent = 'Background sync unavailable in this browser. Prices re-check each time you open this page.';
		return;
	}
	try {
		const reg = await navigator.serviceWorker.register('./sw.js');
		if ('periodicSync' in reg) {
			const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
			if (perm.state === 'granted') {
				try {
					await reg.periodicSync.register('costco-price-check', { minInterval: 24 * 60 * 60 * 1000 });
					statusEl.textContent = 'Periodic background sync registered (daily). Prices also re-check on page load.';
					return;
				} catch {}
			}
		}
		statusEl.textContent = 'Periodic background sync not granted; prices re-check each time you open this page.';
	} catch (e) {
		statusEl.textContent = 'Service worker registration failed: ' + e.message;
	}
	navigator.serviceWorker.addEventListener('message', (ev) => {
		if (ev.data && ev.data.type === 'run-price-check') runDueChecks();
	});
}

// ---------- Init ----------

function init() {
	const s = loadSettings();
	if (s.proxyUrl) $('#proxy-url').value = s.proxyUrl;
	if (s.notifyEnabled && 'Notification' in window && Notification.permission === 'granted')
		$('#notify-toggle').checked = true;
	renderReceipts();
	initBackgroundSync();
	// Run a check on page load for any due receipts.
	runDueChecks();
}

init();

})();
