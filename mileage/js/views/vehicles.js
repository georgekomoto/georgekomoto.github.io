import { list, get, put, remove, getMeta, byIndex, childrenOf } from '../db.js';
import { escapeHtml, formatDistance, formatDate } from '../util/formatters.js';
import { objectUrl, revokeUrls, addAttachment, deleteAttachment } from '../util/media.js';

let mountedUrls = [];

export async function renderList(root) {
  const [vehicles, defaultUnits] = await Promise.all([list('vehicles'), getMeta('units', 'mi')]);
  const active = vehicles.filter((v) => !v.archived);
  const archived = vehicles.filter((v) => v.archived);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Vehicles</h2>
        <a class="btn btn-primary" href="#/vehicles/new">Add vehicle</a>
      </header>

      ${active.length === 0
        ? `<p class="muted">No active vehicles.</p>`
        : `<ul class="list">
            ${active.map((v) => renderRow(v, defaultUnits)).join('')}
          </ul>`
      }

      ${archived.length > 0 ? `
        <details class="archived">
          <summary>Archived (${archived.length})</summary>
          <ul class="list">
            ${archived.map((v) => renderRow(v, defaultUnits)).join('')}
          </ul>
        </details>` : ''
      }
    </section>
  `;
}

function renderRow(v, defaultUnits) {
  const title = v.name || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Vehicle';
  return `
    <li>
      <a href="#/vehicles/${v.id}">
        <div class="list-title">${escapeHtml(title)}</div>
        <div class="list-sub">${escapeHtml(v.plate || '')} · Odometer ${formatDistance(v.currentOdometer, v.units || defaultUnits)}</div>
      </a>
    </li>`;
}

export async function renderForm(root, id) {
  const vehicle = id ? await get('vehicles', id) : null;
  const defaultUnits = await getMeta('units', 'mi');
  const v = vehicle || {
    id: '',
    name: '',
    make: '',
    model: '',
    year: '',
    plate: '',
    currentOdometer: 0,
    units: defaultUnits,
    archived: false,
  };

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${id ? 'Edit vehicle' : 'New vehicle'}</h2>
      </header>
      <form class="form" id="vehicle-form">
        <label>Name<input name="name" value="${escapeHtml(v.name)}" placeholder="e.g. Work van" required></label>
        <div class="row-2">
          <label>Make<input name="make" value="${escapeHtml(v.make)}"></label>
          <label>Model<input name="model" value="${escapeHtml(v.model)}"></label>
        </div>
        <div class="row-2">
          <label>Year<input name="year" type="number" inputmode="numeric" value="${escapeHtml(v.year)}"></label>
          <label>Plate<input name="plate" value="${escapeHtml(v.plate)}"></label>
        </div>
        <div class="row-2">
          <label>Current odometer<input name="currentOdometer" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(v.currentOdometer)}"></label>
          <label>Units
            <select name="units">
              <option value="mi" ${v.units === 'mi' ? 'selected' : ''}>Miles</option>
              <option value="km" ${v.units === 'km' ? 'selected' : ''}>Kilometers</option>
            </select>
          </label>
        </div>
        <label class="checkbox"><input type="checkbox" name="archived" ${v.archived ? 'checked' : ''}> Archived</label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <a class="btn" href="#/vehicles">Cancel</a>
          ${id ? `<button type="button" class="btn btn-danger" id="delete-btn">Delete</button>` : ''}
        </div>
      </form>
    </section>
  `;

  const form = root.querySelector('#vehicle-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const saved = await put('vehicles', {
      ...(vehicle || {}),
      ...data,
      year: data.year ? Number(data.year) : null,
      currentOdometer: data.currentOdometer ? Number(data.currentOdometer) : 0,
      archived: !!data.archived,
    });
    location.hash = `#/vehicles/${saved.id}`;
  });

  const del = root.querySelector('#delete-btn');
  if (del) {
    del.addEventListener('click', async () => {
      if (!confirm('Delete this vehicle? Trips and expenses remain but will be orphaned.')) return;
      await remove('vehicles', id);
      location.hash = '#/vehicles';
    });
  }
}

export async function renderDetail(root, id) {
  revokeUrls(mountedUrls);
  mountedUrls = [];

  const vehicle = await get('vehicles', id);
  if (!vehicle) {
    root.innerHTML = `<section class="view"><p>Vehicle not found. <a href="#/vehicles">Back</a></p></section>`;
    return;
  }
  const [trips, expenses, attachments, defaultUnits] = await Promise.all([
    byIndex('trips', 'vehicleId', id),
    byIndex('expenses', 'vehicleId', id),
    childrenOf('attachments', 'vehicle', id),
    getMeta('units', 'mi'),
  ]);

  const units = vehicle.units || defaultUnits;
  const totalDistance = trips.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const title = vehicle.name || `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'Vehicle';

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${escapeHtml(title)}</h2>
        <a class="btn" href="#/vehicles/${id}/edit">Edit</a>
      </header>

      <dl class="details">
        <dt>Make / Model / Year</dt><dd>${escapeHtml([vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') || '—')}</dd>
        <dt>Plate</dt><dd>${escapeHtml(vehicle.plate || '—')}</dd>
        <dt>Current odometer</dt><dd>${formatDistance(vehicle.currentOdometer, units)}</dd>
        <dt>Total tracked distance</dt><dd>${formatDistance(totalDistance, units)}</dd>
        <dt>Total expenses</dt><dd>${expenses.length} (${totalExpenses.toFixed(2)})</dd>
      </dl>

      <h3>Photos / documents</h3>
      <div class="media-grid" id="media-grid">
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

      <h3>Recent trips</h3>
      ${trips.length === 0
        ? `<p class="muted">No trips yet.</p>`
        : `<ul class="list">
            ${trips
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .slice(0, 10)
              .map((t) => `
                <li>
                  <a href="#/trips/${t.id}">
                    <div class="list-title">${escapeHtml(t.purpose || 'Trip')} — ${formatDate(t.date)}</div>
                    <div class="list-sub">${formatDistance(t.distance, units)}</div>
                  </a>
                </li>`).join('')}
          </ul>`
      }
    </section>
  `;

  root.querySelector('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await addAttachment('vehicle', id, file);
    renderDetail(root, id);
  });

  root.querySelectorAll('[data-attachment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this attachment?')) return;
      await deleteAttachment(btn.dataset.attachment);
      renderDetail(root, id);
    });
  });
}
