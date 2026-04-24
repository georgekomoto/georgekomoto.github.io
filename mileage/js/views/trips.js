import { list, get, put, remove, getMeta, byIndex, childrenOf, saveTripAndUpdateVehicle } from '../db.js';
import { escapeHtml, formatDate, formatDateInput, formatDistance, todayInput } from '../util/formatters.js';
import { objectUrl, revokeUrls, addAttachment, deleteAttachment } from '../util/media.js';

let mountedUrls = [];

export async function renderList(root) {
  const [trips, vehicles, clients, defaultUnits] = await Promise.all([
    list('trips'),
    list('vehicles'),
    list('clients'),
    getMeta('units', 'mi'),
  ]);
  const vMap = new Map(vehicles.map((v) => [v.id, v]));
  const cMap = new Map(clients.map((c) => [c.id, c]));
  const sorted = trips.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Trips</h2>
        <a class="btn btn-primary" href="#/trips/new">Log trip</a>
      </header>
      ${sorted.length === 0
        ? `<p class="muted">No trips yet.</p>`
        : `<ul class="list">
            ${sorted.map((t) => {
              const v = vMap.get(t.vehicleId);
              const units = (v && v.units) || defaultUnits;
              const c = t.clientId ? cMap.get(t.clientId) : null;
              return `
                <li>
                  <a href="#/trips/${t.id}">
                    <div class="list-title">${escapeHtml(t.purpose || 'Trip')}</div>
                    <div class="list-sub">
                      ${formatDate(t.date)} · ${escapeHtml((v && v.name) || '—')} · ${formatDistance(t.distance, units)}
                      ${c ? ` · ${escapeHtml(c.name)}` : ''}
                    </div>
                  </a>
                </li>`;
            }).join('')}
          </ul>`
      }
    </section>
  `;
}

export async function renderForm(root, id) {
  const existing = id ? await get('trips', id) : null;
  const [vehicles, clients, events] = await Promise.all([
    list('vehicles'),
    list('clients'),
    list('events'),
  ]);
  const activeVehicles = vehicles.filter((v) => !v.archived);
  if (activeVehicles.length === 0) {
    root.innerHTML = `
      <section class="view">
        <header class="view-header"><h2>New trip</h2></header>
        <p>You need a vehicle first. <a href="#/vehicles/new">Add a vehicle</a>.</p>
      </section>`;
    return;
  }

  const defaultVehicleId = await getMeta('defaultVehicleId', activeVehicles[0].id);
  const t = existing || {
    id: '',
    vehicleId: defaultVehicleId || activeVehicles[0].id,
    date: todayInput(),
    startOdometer: '',
    endOdometer: '',
    purpose: '',
    clientId: '',
    eventId: '',
    notes: '',
  };

  // Autofill startOdometer from the most recent trip's end odometer for this
  // vehicle. Falls back to vehicle.currentOdometer if no prior trip has one.
  if (!existing) {
    t.startOdometer = await suggestedStartOdometer(t.vehicleId, activeVehicles);
  }

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${id ? 'Edit trip' : 'New trip'}</h2>
      </header>
      <form class="form" id="trip-form">
        <label>Vehicle
          <select name="vehicleId" required>
            ${activeVehicles.map((v) => `
              <option value="${v.id}" ${v.id === t.vehicleId ? 'selected' : ''}>${escapeHtml(v.name || v.plate || 'Vehicle')}</option>
            `).join('')}
          </select>
        </label>
        <div class="row-2">
          <label>Date<input name="date" type="date" value="${escapeHtml(formatDateInput(t.date))}" required></label>
          <label>Purpose<input name="purpose" value="${escapeHtml(t.purpose)}" placeholder="e.g. Site visit"></label>
        </div>
        <div class="row-2">
          <label>Start odometer<input name="startOdometer" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(t.startOdometer)}"></label>
          <label>End odometer<input name="endOdometer" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(t.endOdometer)}"></label>
        </div>
        <div class="row-2">
          <label>Client
            <select name="clientId">
              <option value="">—</option>
              ${clients.filter((c) => !c.archived).map((c) => `
                <option value="${c.id}" ${c.id === t.clientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
              `).join('')}
            </select>
          </label>
          <label>Event
            <select name="eventId">
              <option value="">—</option>
              ${events.map((ev) => `
                <option value="${ev.id}" ${ev.id === t.eventId ? 'selected' : ''}>${escapeHtml(ev.name)}</option>
              `).join('')}
            </select>
          </label>
        </div>
        <label>Notes<textarea name="notes" rows="3">${escapeHtml(t.notes)}</textarea></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <a class="btn" href="#/trips">Cancel</a>
          ${id ? `<button type="button" class="btn btn-danger" id="delete-btn">Delete</button>` : ''}
        </div>
      </form>
    </section>
  `;

  // When vehicle changes on a new trip, refetch the prior trip's end odometer
  const form = root.querySelector('#trip-form');
  if (!existing) {
    form.vehicleId.addEventListener('change', async () => {
      const value = await suggestedStartOdometer(form.vehicleId.value, activeVehicles);
      form.startOdometer.value = value ?? '';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const start = data.startOdometer !== '' ? Number(data.startOdometer) : null;
    const end = data.endOdometer !== '' ? Number(data.endOdometer) : null;
    if (start != null && end != null && end < start) {
      alert('End odometer must be greater than or equal to start odometer.');
      return;
    }
    const record = {
      ...(existing || {}),
      vehicleId: data.vehicleId,
      date: data.date,
      purpose: data.purpose || '',
      startOdometer: start,
      endOdometer: end,
      clientId: data.clientId || null,
      eventId: data.eventId || null,
      notes: data.notes || '',
    };
    const saved = await saveTripAndUpdateVehicle(record);
    location.hash = `#/trips/${saved.id}`;
  });

  const del = root.querySelector('#delete-btn');
  if (del) {
    del.addEventListener('click', async () => {
      if (!confirm('Delete this trip? Attached expenses will remain but be orphaned.')) return;
      await remove('trips', id);
      location.hash = '#/trips';
    });
  }
}

async function suggestedStartOdometer(vehicleId, activeVehicles) {
  const trips = await byIndex('trips', 'vehicleId', vehicleId);
  const completed = trips.filter((t) => t.endOdometer != null && t.endOdometer !== '');
  if (completed.length > 0) {
    completed.sort((a, b) => {
      const d = (b.date || '').localeCompare(a.date || '');
      return d !== 0 ? d : (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return completed[0].endOdometer;
  }
  const v = activeVehicles.find((x) => x.id === vehicleId);
  return v && v.currentOdometer != null ? v.currentOdometer : '';
}

export async function renderDetail(root, id) {
  revokeUrls(mountedUrls);
  mountedUrls = [];

  const trip = await get('trips', id);
  if (!trip) {
    root.innerHTML = `<section class="view"><p>Trip not found. <a href="#/trips">Back</a></p></section>`;
    return;
  }
  const [vehicle, client, event, expenses, attachments, comments, defaultUnits] = await Promise.all([
    get('vehicles', trip.vehicleId),
    trip.clientId ? get('clients', trip.clientId) : null,
    trip.eventId ? get('events', trip.eventId) : null,
    byIndex('expenses', 'tripId', trip.id),
    childrenOf('attachments', 'trip', trip.id),
    childrenOf('comments', 'trip', trip.id),
    getMeta('units', 'mi'),
  ]);
  const units = (vehicle && vehicle.units) || defaultUnits;

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${escapeHtml(trip.purpose || 'Trip')}</h2>
        <a class="btn" href="#/trips/${id}/edit">Edit</a>
      </header>

      <dl class="details">
        <dt>Date</dt><dd>${formatDate(trip.date)}</dd>
        <dt>Vehicle</dt><dd>${vehicle ? `<a href="#/vehicles/${vehicle.id}">${escapeHtml(vehicle.name || 'Vehicle')}</a>` : '—'}</dd>
        <dt>Client</dt><dd>${client ? `<a href="#/clients/${client.id}">${escapeHtml(client.name)}</a>` : '—'}</dd>
        <dt>Event</dt><dd>${event ? escapeHtml(event.name) : '—'}</dd>
        <dt>Start odometer</dt><dd>${formatDistance(trip.startOdometer, units)}</dd>
        <dt>End odometer</dt><dd>${trip.endOdometer != null ? formatDistance(trip.endOdometer, units) : '<em>in progress</em>'}</dd>
        <dt>Distance</dt><dd>${formatDistance(trip.distance, units)}</dd>
        ${trip.notes ? `<dt>Notes</dt><dd>${escapeHtml(trip.notes).replace(/\n/g, '<br>')}</dd>` : ''}
      </dl>

      <h3>Expenses</h3>
      ${expenses.length === 0
        ? `<p class="muted">No expenses attached. <a href="#/expenses/new?tripId=${trip.id}">Add one</a>.</p>`
        : `<ul class="list">
            ${expenses.map((ex) => `
              <li>
                <a href="#/expenses/${ex.id}">
                  <div class="list-title">${escapeHtml(ex.type || '')} · ${Number(ex.amount || 0).toFixed(2)}</div>
                  <div class="list-sub">${formatDate(ex.date)}${ex.vendor ? ' · ' + escapeHtml(ex.vendor) : ''}</div>
                </a>
              </li>`).join('')}
          </ul>
          <a class="btn" href="#/expenses/new?tripId=${trip.id}">Add expense</a>`
      }

      <h3>Photos / documents</h3>
      <div class="media-grid">
        ${attachments.map((a) => {
          const url = objectUrl(a);
          mountedUrls.push(url);
          return `
            <figure class="media-item">
              ${a.mimeType && a.mimeType.startsWith('image/')
                ? `<img src="${url}" alt="${escapeHtml(a.caption || '')}">`
                : `<a href="${url}" target="_blank">${escapeHtml(a.caption || a.mimeType || 'file')}</a>`}
              <button class="btn btn-small btn-danger" data-attachment="${a.id}">Remove</button>
            </figure>`;
        }).join('')}
      </div>
      <label class="file-picker">
        <input type="file" accept="image/*" capture="environment" id="photo-input">
        <span>Add photo</span>
      </label>

      <h3>Comments</h3>
      <ul class="comments">
        ${comments.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map((c) => `
          <li>
            <div class="comment-body">${escapeHtml(c.body).replace(/\n/g, '<br>')}</div>
            <div class="comment-meta">${formatDate(c.createdAt)} <button class="link-btn" data-comment="${c.id}">delete</button></div>
          </li>`).join('')}
      </ul>
      <form id="comment-form" class="form">
        <label>Add comment<textarea name="body" rows="2" required></textarea></label>
        <button class="btn" type="submit">Post comment</button>
      </form>
    </section>
  `;

  root.querySelector('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await addAttachment('trip', trip.id, file);
    renderDetail(root, id);
  });

  root.querySelectorAll('[data-attachment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this attachment?')) return;
      await deleteAttachment(btn.dataset.attachment);
      renderDetail(root, id);
    });
  });

  root.querySelector('#comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await put('comments', {
      parentType: 'trip',
      parentId: trip.id,
      body: fd.get('body') || '',
    });
    renderDetail(root, id);
  });

  root.querySelectorAll('[data-comment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this comment?')) return;
      await remove('comments', btn.dataset.comment);
      renderDetail(root, id);
    });
  });
}
