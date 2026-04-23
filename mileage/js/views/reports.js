import { list, getMeta } from '../db.js';
import { escapeHtml, formatDate, formatDistance, formatMoney, expenseTypeLabel, todayInput } from '../util/formatters.js';
import { downloadCsv } from '../util/csv.js';
import { printCurrentView } from '../util/print.js';

export async function render(root) {
  const [vehicles, clients, defaultUnits, currency] = await Promise.all([
    list('vehicles'),
    list('clients'),
    getMeta('units', 'mi'),
    getMeta('currency', 'USD'),
  ]);

  const lastFilter = (await getMeta('lastReportFilter', null)) || {
    from: firstOfMonth(),
    to: todayInput(),
    vehicleId: '',
    clientId: '',
    groupBy: 'trip',
    kind: 'trips',
  };

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Reports</h2>
      </header>
      <form class="form no-print" id="report-form">
        <div class="row-2">
          <label>From<input name="from" type="date" value="${escapeHtml(lastFilter.from)}"></label>
          <label>To<input name="to" type="date" value="${escapeHtml(lastFilter.to)}"></label>
        </div>
        <div class="row-2">
          <label>Vehicle
            <select name="vehicleId">
              <option value="">All</option>
              ${vehicles.map((v) => `
                <option value="${v.id}" ${v.id === lastFilter.vehicleId ? 'selected' : ''}>${escapeHtml(v.name || 'Vehicle')}</option>
              `).join('')}
            </select>
          </label>
          <label>Client
            <select name="clientId">
              <option value="">All</option>
              ${clients.map((c) => `
                <option value="${c.id}" ${c.id === lastFilter.clientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
              `).join('')}
            </select>
          </label>
        </div>
        <div class="row-2">
          <label>Include
            <select name="kind">
              <option value="trips" ${lastFilter.kind === 'trips' ? 'selected' : ''}>Trips</option>
              <option value="expenses" ${lastFilter.kind === 'expenses' ? 'selected' : ''}>Expenses</option>
              <option value="both" ${lastFilter.kind === 'both' ? 'selected' : ''}>Both (separate tables)</option>
            </select>
          </label>
          <label>Group by
            <select name="groupBy">
              <option value="trip" ${lastFilter.groupBy === 'trip' ? 'selected' : ''}>None (list)</option>
              <option value="vehicle" ${lastFilter.groupBy === 'vehicle' ? 'selected' : ''}>Vehicle</option>
              <option value="client" ${lastFilter.groupBy === 'client' ? 'selected' : ''}>Client</option>
              <option value="month" ${lastFilter.groupBy === 'month' ? 'selected' : ''}>Month</option>
              <option value="type" ${lastFilter.groupBy === 'type' ? 'selected' : ''}>Expense type</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">Run report</button>
          <button class="btn" type="button" id="export-csv" disabled>Export CSV</button>
          <button class="btn" type="button" id="print-btn" disabled>Print</button>
        </div>
      </form>
      <div id="report-output"></div>
    </section>
  `;

  const form = root.querySelector('#report-form');
  const out = root.querySelector('#report-output');
  const exportBtn = root.querySelector('#export-csv');
  const printBtn = root.querySelector('#print-btn');

  let lastCsvExports = [];

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const filter = Object.fromEntries(new FormData(form).entries());
    await import('../db.js').then((m) => m.setMeta('lastReportFilter', filter));
    const result = await runReport(filter, { vehicles, clients, units: defaultUnits, currency });
    out.innerHTML = result.html;
    lastCsvExports = result.csvExports;
    exportBtn.disabled = lastCsvExports.length === 0;
    printBtn.disabled = !result.html;
  });

  exportBtn.addEventListener('click', () => {
    for (const ex of lastCsvExports) {
      downloadCsv(ex.filename, ex.rows, ex.columns);
    }
  });

  printBtn.addEventListener('click', () => {
    printCurrentView('Mileage report');
  });
}

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

async function runReport(filter, ctx) {
  const [trips, expenses] = await Promise.all([list('trips'), list('expenses')]);
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    if (filter.from && dateStr < filter.from) return false;
    if (filter.to && dateStr > filter.to) return false;
    return true;
  };
  const vMap = new Map(ctx.vehicles.map((v) => [v.id, v]));
  const cMap = new Map(ctx.clients.map((c) => [c.id, c]));

  const filteredTrips = trips.filter((t) => {
    if (!inRange(t.date)) return false;
    if (filter.vehicleId && t.vehicleId !== filter.vehicleId) return false;
    if (filter.clientId && t.clientId !== filter.clientId) return false;
    return true;
  });
  const tripIds = new Set(filteredTrips.map((t) => t.id));
  const filteredExpenses = expenses.filter((ex) => {
    if (!inRange(ex.date)) return false;
    if (filter.vehicleId && ex.vehicleId !== filter.vehicleId) return false;
    // If client filter: only expenses attached to trips belonging to that client
    if (filter.clientId) {
      if (!ex.tripId) return false;
      const t = trips.find((x) => x.id === ex.tripId);
      return t && t.clientId === filter.clientId;
    }
    return true;
  });

  const blocks = [];
  const csvExports = [];

  const includeTrips = filter.kind === 'trips' || filter.kind === 'both';
  const includeExpenses = filter.kind === 'expenses' || filter.kind === 'both';

  if (includeTrips) {
    const block = buildTripBlock(filteredTrips, filter.groupBy, vMap, cMap, ctx.units);
    blocks.push(block.html);
    csvExports.push({
      filename: `trips-${filter.from}_${filter.to}.csv`,
      rows: filteredTrips,
      columns: tripCsvColumns(vMap, cMap),
    });
  }

  if (includeExpenses) {
    const block = buildExpenseBlock(filteredExpenses, filter.groupBy, vMap, cMap, trips, ctx.currency);
    blocks.push(block.html);
    csvExports.push({
      filename: `expenses-${filter.from}_${filter.to}.csv`,
      rows: filteredExpenses,
      columns: expenseCsvColumns(vMap, trips),
    });
  }

  return {
    html: `<div class="report">
      <header class="report-header">
        <h3>Report · ${escapeHtml(filter.from)} — ${escapeHtml(filter.to)}</h3>
        <p class="muted small">
          ${filter.vehicleId ? 'Vehicle: ' + escapeHtml((vMap.get(filter.vehicleId) || {}).name || '') + ' · ' : ''}
          ${filter.clientId ? 'Client: ' + escapeHtml((cMap.get(filter.clientId) || {}).name || '') + ' · ' : ''}
          Grouped by ${escapeHtml(filter.groupBy)}
        </p>
      </header>
      ${blocks.join('')}
    </div>`,
    csvExports,
  };
}

function groupItems(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const k = keyFn(item) || '—';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(item);
  }
  return groups;
}

function buildTripBlock(trips, groupBy, vMap, cMap, units) {
  if (trips.length === 0) {
    return { html: `<h3>Trips</h3><p class="muted">No trips in range.</p>` };
  }
  const totalDistance = trips.reduce((s, t) => s + (Number(t.distance) || 0), 0);

  const keyFn = {
    trip: () => 'All',
    vehicle: (t) => (vMap.get(t.vehicleId) || {}).name || '—',
    client: (t) => t.clientId ? (cMap.get(t.clientId) || {}).name || '—' : '(unassigned)',
    month: (t) => (t.date || '').slice(0, 7),
    type: () => 'All',
  }[groupBy] || (() => 'All');

  const groups = groupItems(trips, keyFn);
  const groupSections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => {
      const subtotal = rows.reduce((s, t) => s + (Number(t.distance) || 0), 0);
      return `
        ${groupBy !== 'trip' ? `<h4>${escapeHtml(label)} — ${formatDistance(subtotal, units)}</h4>` : ''}
        <table class="report-table">
          <thead>
            <tr><th>Date</th><th>Vehicle</th><th>Purpose</th><th>Client</th><th class="num">Distance</th></tr>
          </thead>
          <tbody>
            ${rows
              .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
              .map((t) => {
                const v = vMap.get(t.vehicleId);
                const vUnits = (v && v.units) || units;
                const c = t.clientId ? cMap.get(t.clientId) : null;
                return `<tr>
                  <td>${formatDate(t.date)}</td>
                  <td>${escapeHtml((v && v.name) || '—')}</td>
                  <td>${escapeHtml(t.purpose || '')}</td>
                  <td>${escapeHtml((c && c.name) || '')}</td>
                  <td class="num">${formatDistance(t.distance, vUnits)}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>`;
    }).join('');

  return {
    html: `
      <h3>Trips — ${trips.length} trip(s), total ${formatDistance(totalDistance, units)}</h3>
      ${groupSections}
    `,
  };
}

function buildExpenseBlock(expenses, groupBy, vMap, cMap, trips, currency) {
  if (expenses.length === 0) {
    return { html: `<h3>Expenses</h3><p class="muted">No expenses in range.</p>` };
  }
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const tripMap = new Map(trips.map((t) => [t.id, t]));

  const keyFn = {
    trip: () => 'All',
    vehicle: (ex) => (vMap.get(ex.vehicleId) || {}).name || '—',
    client: (ex) => {
      const t = ex.tripId ? tripMap.get(ex.tripId) : null;
      return t && t.clientId ? (cMap.get(t.clientId) || {}).name || '—' : '(unassigned)';
    },
    month: (ex) => (ex.date || '').slice(0, 7),
    type: (ex) => expenseTypeLabel(ex.type),
  }[groupBy] || (() => 'All');

  const groups = groupItems(expenses, keyFn);
  const groupSections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => {
      const subtotal = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return `
        ${groupBy !== 'trip' ? `<h4>${escapeHtml(label)} — ${formatMoney(subtotal, currency)}</h4>` : ''}
        <table class="report-table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Vehicle</th><th>Vendor</th><th>Trip</th><th class="num">Amount</th></tr>
          </thead>
          <tbody>
            ${rows
              .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
              .map((ex) => {
                const v = vMap.get(ex.vehicleId);
                const t = ex.tripId ? tripMap.get(ex.tripId) : null;
                return `<tr>
                  <td>${formatDate(ex.date)}</td>
                  <td>${escapeHtml(expenseTypeLabel(ex.type))}</td>
                  <td>${escapeHtml((v && v.name) || '—')}</td>
                  <td>${escapeHtml(ex.vendor || '')}</td>
                  <td>${escapeHtml(t ? (t.purpose || formatDate(t.date)) : '')}</td>
                  <td class="num">${formatMoney(ex.amount, ex.currency || currency)}</td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>`;
    }).join('');

  return {
    html: `
      <h3>Expenses — ${expenses.length} item(s), total ${formatMoney(total, currency)}</h3>
      ${groupSections}
    `,
  };
}

function tripCsvColumns(vMap, cMap) {
  return [
    { label: 'Date', get: (t) => t.date || '' },
    { label: 'Vehicle', get: (t) => (vMap.get(t.vehicleId) || {}).name || '' },
    { label: 'Purpose', get: (t) => t.purpose || '' },
    { label: 'Client', get: (t) => t.clientId ? (cMap.get(t.clientId) || {}).name || '' : '' },
    { label: 'Start odometer', get: (t) => t.startOdometer ?? '' },
    { label: 'End odometer', get: (t) => t.endOdometer ?? '' },
    { label: 'Distance', get: (t) => t.distance ?? '' },
    { label: 'Notes', get: (t) => t.notes || '' },
  ];
}

function expenseCsvColumns(vMap, trips) {
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  return [
    { label: 'Date', get: (ex) => ex.date || '' },
    { label: 'Type', get: (ex) => expenseTypeLabel(ex.type) },
    { label: 'Vehicle', get: (ex) => (vMap.get(ex.vehicleId) || {}).name || '' },
    { label: 'Vendor', get: (ex) => ex.vendor || '' },
    { label: 'Amount', get: (ex) => ex.amount ?? '' },
    { label: 'Currency', get: (ex) => ex.currency || '' },
    { label: 'Trip', get: (ex) => {
        const t = ex.tripId ? tripMap.get(ex.tripId) : null;
        return t ? (t.purpose || t.date || '') : '';
    } },
    { label: 'Notes', get: (ex) => ex.notes || '' },
  ];
}
