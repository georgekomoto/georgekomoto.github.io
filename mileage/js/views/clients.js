import { list, get, put, remove, byIndex, getMeta } from '../db.js';
import { escapeHtml, formatDate, formatDistance, formatMoney } from '../util/formatters.js';

export async function renderList(root) {
  const clients = await list('clients');
  const active = clients.filter((c) => !c.archived);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Clients</h2>
        <a class="btn btn-primary" href="#/clients/new">Add client</a>
      </header>
      ${active.length === 0
        ? `<p class="muted">No clients yet.</p>`
        : `<ul class="list">
            ${active.map((c) => `
              <li>
                <a href="#/clients/${c.id}">
                  <div class="list-title">${escapeHtml(c.name)}</div>
                  <div class="list-sub">${escapeHtml(c.contact || '')}</div>
                </a>
              </li>`).join('')}
          </ul>`
      }
    </section>
  `;
}

export async function renderForm(root, id) {
  const existing = id ? await get('clients', id) : null;
  const c = existing || { id: '', name: '', contact: '', notes: '', archived: false };

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${id ? 'Edit client' : 'New client'}</h2>
      </header>
      <form class="form" id="client-form">
        <label>Name<input name="name" value="${escapeHtml(c.name)}" required></label>
        <label>Contact<input name="contact" value="${escapeHtml(c.contact)}" placeholder="phone, email, address"></label>
        <label>Notes<textarea name="notes" rows="3">${escapeHtml(c.notes)}</textarea></label>
        <label class="checkbox"><input type="checkbox" name="archived" ${c.archived ? 'checked' : ''}> Archived</label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <a class="btn" href="#/clients">Cancel</a>
          ${id ? `<button type="button" class="btn btn-danger" id="delete-btn">Delete</button>` : ''}
        </div>
      </form>
    </section>
  `;

  root.querySelector('#client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const saved = await put('clients', {
      ...(existing || {}),
      name: data.name,
      contact: data.contact || '',
      notes: data.notes || '',
      archived: !!data.archived,
    });
    location.hash = `#/clients/${saved.id}`;
  });

  const del = root.querySelector('#delete-btn');
  if (del) {
    del.addEventListener('click', async () => {
      if (!confirm('Delete this client? Trips and expenses remain.')) return;
      await remove('clients', id);
      location.hash = '#/clients';
    });
  }
}

export async function renderDetail(root, id) {
  const client = await get('clients', id);
  if (!client) {
    root.innerHTML = `<section class="view"><p>Client not found. <a href="#/clients">Back</a></p></section>`;
    return;
  }
  const [trips, vehicles, currency, defaultUnits] = await Promise.all([
    byIndex('trips', 'clientId', id),
    list('vehicles'),
    getMeta('currency', 'USD'),
    getMeta('units', 'mi'),
  ]);
  const vMap = new Map(vehicles.map((v) => [v.id, v]));

  // Expenses attached to trips belonging to this client
  const tripIds = new Set(trips.map((t) => t.id));
  const allExpenses = await list('expenses');
  const expenses = allExpenses.filter((ex) => ex.tripId && tripIds.has(ex.tripId));

  const totalDistance = trips.reduce((s, t) => s + (Number(t.distance) || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${escapeHtml(client.name)}</h2>
        <a class="btn" href="#/clients/${id}/edit">Edit</a>
      </header>
      <dl class="details">
        <dt>Contact</dt><dd>${escapeHtml(client.contact || '—')}</dd>
        <dt>Notes</dt><dd>${escapeHtml(client.notes || '—').replace(/\n/g, '<br>')}</dd>
        <dt>Trips</dt><dd>${trips.length} (${formatDistance(totalDistance, defaultUnits)})</dd>
        <dt>Expenses</dt><dd>${expenses.length} · ${formatMoney(totalExpenses, currency)}</dd>
      </dl>

      <h3>Trips</h3>
      ${trips.length === 0
        ? `<p class="muted">No trips tagged with this client.</p>`
        : `<ul class="list">
            ${trips
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .map((t) => {
                const v = vMap.get(t.vehicleId);
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
    </section>
  `;
}
