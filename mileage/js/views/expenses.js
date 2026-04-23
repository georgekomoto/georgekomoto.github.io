import { list, get, put, remove, getMeta, byIndex, childrenOf } from '../db.js';
import { escapeHtml, formatDate, formatDateInput, formatMoney, todayInput, EXPENSE_TYPES, expenseTypeLabel } from '../util/formatters.js';
import { objectUrl, revokeUrls, addAttachment, deleteAttachment } from '../util/media.js';

let mountedUrls = [];

export async function renderList(root) {
  const [expenses, vehicles, currency] = await Promise.all([
    list('expenses'),
    list('vehicles'),
    getMeta('currency', 'USD'),
  ]);
  const vMap = new Map(vehicles.map((v) => [v.id, v]));
  const sorted = expenses.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = sorted.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Expenses</h2>
        <a class="btn btn-primary" href="#/expenses/new">Log expense</a>
      </header>
      ${sorted.length === 0
        ? `<p class="muted">No expenses yet.</p>`
        : `<p class="muted small">${sorted.length} expenses · ${formatMoney(total, currency)}</p>
           <ul class="list">
            ${sorted.map((ex) => {
              const v = vMap.get(ex.vehicleId);
              return `
                <li>
                  <a href="#/expenses/${ex.id}">
                    <div class="list-title">${escapeHtml(expenseTypeLabel(ex.type))} · ${formatMoney(ex.amount, ex.currency || currency)}</div>
                    <div class="list-sub">
                      ${formatDate(ex.date)} · ${escapeHtml((v && v.name) || '—')}
                      ${ex.vendor ? ' · ' + escapeHtml(ex.vendor) : ''}
                    </div>
                  </a>
                </li>`;
            }).join('')}
          </ul>`
      }
    </section>
  `;
}

export async function renderForm(root, id, params = {}) {
  const existing = id ? await get('expenses', id) : null;
  const [vehicles, trips, currency, defaultVehicleId] = await Promise.all([
    list('vehicles'),
    list('trips'),
    getMeta('currency', 'USD'),
    getMeta('defaultVehicleId', null),
  ]);
  const activeVehicles = vehicles.filter((v) => !v.archived);
  if (activeVehicles.length === 0) {
    root.innerHTML = `
      <section class="view">
        <header class="view-header"><h2>New expense</h2></header>
        <p>You need a vehicle first. <a href="#/vehicles/new">Add a vehicle</a>.</p>
      </section>`;
    return;
  }

  let initialTripId = params.tripId || null;
  let initialVehicleId = defaultVehicleId || activeVehicles[0].id;
  if (initialTripId) {
    const t = trips.find((x) => x.id === initialTripId);
    if (t) initialVehicleId = t.vehicleId;
  }

  const ex = existing || {
    id: '',
    type: 'toll',
    vehicleId: initialVehicleId,
    tripId: initialTripId || '',
    date: todayInput(),
    amount: '',
    currency,
    vendor: '',
    notes: '',
  };

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${id ? 'Edit expense' : 'New expense'}</h2>
      </header>
      <form class="form" id="expense-form">
        <div class="row-2">
          <label>Type
            <select name="type" required>
              ${EXPENSE_TYPES.map((t) => `
                <option value="${t.value}" ${t.value === ex.type ? 'selected' : ''}>${escapeHtml(t.label)}</option>
              `).join('')}
            </select>
          </label>
          <label>Date<input name="date" type="date" value="${escapeHtml(formatDateInput(ex.date))}" required></label>
        </div>
        <div class="row-2">
          <label>Amount<input name="amount" type="number" step="0.01" value="${escapeHtml(ex.amount)}" required></label>
          <label>Currency<input name="currency" value="${escapeHtml(ex.currency || currency)}" maxlength="3"></label>
        </div>
        <label>Vehicle
          <select name="vehicleId" required>
            ${activeVehicles.map((v) => `
              <option value="${v.id}" ${v.id === ex.vehicleId ? 'selected' : ''}>${escapeHtml(v.name || 'Vehicle')}</option>
            `).join('')}
          </select>
        </label>
        <label>Attach to trip (optional)
          <select name="tripId">
            <option value="">—</option>
            ${trips
              .filter((t) => t.vehicleId === ex.vehicleId)
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .slice(0, 50)
              .map((t) => `
                <option value="${t.id}" ${t.id === ex.tripId ? 'selected' : ''}>${formatDate(t.date)} — ${escapeHtml(t.purpose || 'Trip')}</option>
              `).join('')}
          </select>
        </label>
        <label>Vendor<input name="vendor" value="${escapeHtml(ex.vendor)}" placeholder="e.g. Shell, Discount Tire"></label>
        <label>Notes<textarea name="notes" rows="3">${escapeHtml(ex.notes)}</textarea></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <a class="btn" href="#/expenses">Cancel</a>
          ${id ? `<button type="button" class="btn btn-danger" id="delete-btn">Delete</button>` : ''}
        </div>
      </form>
    </section>
  `;

  const form = root.querySelector('#expense-form');

  // When vehicle changes, rebuild trip picker
  form.vehicleId.addEventListener('change', () => {
    const sel = form.tripId;
    const current = sel.value;
    const vehicleTrips = trips.filter((t) => t.vehicleId === form.vehicleId.value);
    sel.innerHTML =
      '<option value="">—</option>' +
      vehicleTrips
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 50)
        .map((t) => `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${formatDate(t.date)} — ${escapeHtml(t.purpose || 'Trip')}</option>`)
        .join('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const saved = await put('expenses', {
      ...(existing || {}),
      type: data.type,
      vehicleId: data.vehicleId,
      tripId: data.tripId || null,
      date: data.date,
      amount: Number(data.amount || 0),
      currency: (data.currency || currency).toUpperCase(),
      vendor: data.vendor || '',
      notes: data.notes || '',
    });
    location.hash = `#/expenses/${saved.id}`;
  });

  const del = root.querySelector('#delete-btn');
  if (del) {
    del.addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      await remove('expenses', id);
      location.hash = '#/expenses';
    });
  }
}

export async function renderDetail(root, id) {
  revokeUrls(mountedUrls);
  mountedUrls = [];

  const expense = await get('expenses', id);
  if (!expense) {
    root.innerHTML = `<section class="view"><p>Expense not found. <a href="#/expenses">Back</a></p></section>`;
    return;
  }
  const [vehicle, trip, attachments, comments, currency] = await Promise.all([
    get('vehicles', expense.vehicleId),
    expense.tripId ? get('trips', expense.tripId) : null,
    childrenOf('attachments', 'expense', expense.id),
    childrenOf('comments', 'expense', expense.id),
    getMeta('currency', 'USD'),
  ]);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${escapeHtml(expenseTypeLabel(expense.type))} — ${formatMoney(expense.amount, expense.currency || currency)}</h2>
        <a class="btn" href="#/expenses/${id}/edit">Edit</a>
      </header>

      <dl class="details">
        <dt>Date</dt><dd>${formatDate(expense.date)}</dd>
        <dt>Vehicle</dt><dd>${vehicle ? `<a href="#/vehicles/${vehicle.id}">${escapeHtml(vehicle.name || 'Vehicle')}</a>` : '—'}</dd>
        <dt>Trip</dt><dd>${trip ? `<a href="#/trips/${trip.id}">${escapeHtml(trip.purpose || formatDate(trip.date))}</a>` : '—'}</dd>
        <dt>Vendor</dt><dd>${escapeHtml(expense.vendor || '—')}</dd>
        ${expense.notes ? `<dt>Notes</dt><dd>${escapeHtml(expense.notes).replace(/\n/g, '<br>')}</dd>` : ''}
      </dl>

      <h3>Receipts / photos</h3>
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
    await addAttachment('expense', expense.id, file);
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
      parentType: 'expense',
      parentId: expense.id,
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
