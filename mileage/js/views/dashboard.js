import { list, getMeta } from '../db.js';
import { escapeHtml, formatDate, formatDistance } from '../util/formatters.js';

export async function render(root) {
  const [vehicles, trips, expenses, defaultUnits] = await Promise.all([
    list('vehicles'),
    list('trips'),
    list('expenses'),
    getMeta('units', 'mi'),
  ]);

  const activeVehicles = vehicles.filter((v) => !v.archived);
  const recentTrips = trips
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Dashboard</h2>
      </header>

      <div class="card-grid">
        <a class="card card-action" href="#/trips/new"><span class="card-label">Log a trip</span></a>
        <a class="card card-action" href="#/expenses/new"><span class="card-label">Log an expense</span></a>
      </div>

      <h3>Vehicles</h3>
      ${activeVehicles.length === 0
        ? `<p class="muted">No vehicles yet. <a href="#/vehicles/new">Add one</a> to get started.</p>`
        : `<ul class="list">
            ${activeVehicles.map((v) => `
              <li>
                <a href="#/vehicles/${v.id}">
                  <div class="list-title">${escapeHtml(v.name || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Vehicle')}</div>
                  <div class="list-sub">Odometer: ${formatDistance(v.currentOdometer, v.units || defaultUnits)}</div>
                </a>
              </li>
            `).join('')}
          </ul>`
      }

      <h3>Recent trips</h3>
      ${recentTrips.length === 0
        ? `<p class="muted">No trips logged yet.</p>`
        : `<ul class="list">
            ${recentTrips.map((t) => {
              const v = vehicles.find((x) => x.id === t.vehicleId);
              const units = (v && v.units) || defaultUnits;
              return `
                <li>
                  <a href="#/trips/${t.id}">
                    <div class="list-title">${escapeHtml(t.purpose || 'Trip')} — ${formatDate(t.date)}</div>
                    <div class="list-sub">${escapeHtml((v && v.name) || '—')} · ${formatDistance(t.distance, units)}</div>
                  </a>
                </li>`;
            }).join('')}
          </ul>`
      }

      <p class="muted small">${trips.length} trip(s), ${expenses.length} expense(s) stored.</p>
    </section>
  `;
}
