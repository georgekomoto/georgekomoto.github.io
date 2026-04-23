import { list, get, put, remove } from '../db.js';
import { escapeHtml, formatDate, formatDateInput } from '../util/formatters.js';

export async function renderList(root) {
  const events = await list('events');
  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Events</h2>
        <a class="btn btn-primary" href="#/events/new">Add event</a>
      </header>
      ${events.length === 0
        ? `<p class="muted">No events yet.</p>`
        : `<ul class="list">
            ${events.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((e) => `
              <li>
                <a href="#/events/${e.id}">
                  <div class="list-title">${escapeHtml(e.name)}</div>
                  <div class="list-sub">${formatDate(e.date) || ''}</div>
                </a>
              </li>`).join('')}
          </ul>`
      }
    </section>
  `;
}

export async function renderForm(root, id) {
  const [existing, clients] = await Promise.all([
    id ? get('events', id) : null,
    list('clients'),
  ]);
  const ev = existing || { id: '', name: '', date: '', clientId: '', notes: '' };

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${id ? 'Edit event' : 'New event'}</h2>
      </header>
      <form class="form" id="event-form">
        <label>Name<input name="name" value="${escapeHtml(ev.name)}" required></label>
        <label>Date<input name="date" type="date" value="${escapeHtml(formatDateInput(ev.date))}"></label>
        <label>Client
          <select name="clientId">
            <option value="">—</option>
            ${clients.filter((c) => !c.archived).map((c) => `
              <option value="${c.id}" ${c.id === ev.clientId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
            `).join('')}
          </select>
        </label>
        <label>Notes<textarea name="notes" rows="3">${escapeHtml(ev.notes)}</textarea></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <a class="btn" href="#/events">Cancel</a>
          ${id ? `<button type="button" class="btn btn-danger" id="delete-btn">Delete</button>` : ''}
        </div>
      </form>
    </section>
  `;

  root.querySelector('#event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const saved = await put('events', {
      ...(existing || {}),
      name: data.name,
      date: data.date || null,
      clientId: data.clientId || null,
      notes: data.notes || '',
    });
    location.hash = `#/events/${saved.id}`;
  });

  const del = root.querySelector('#delete-btn');
  if (del) {
    del.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      await remove('events', id);
      location.hash = '#/events';
    });
  }
}

export async function renderDetail(root, id) {
  const ev = await get('events', id);
  if (!ev) {
    root.innerHTML = `<section class="view"><p>Event not found. <a href="#/events">Back</a></p></section>`;
    return;
  }
  const client = ev.clientId ? await get('clients', ev.clientId) : null;
  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>${escapeHtml(ev.name)}</h2>
        <a class="btn" href="#/events/${id}/edit">Edit</a>
      </header>
      <dl class="details">
        <dt>Date</dt><dd>${formatDate(ev.date) || '—'}</dd>
        <dt>Client</dt><dd>${client ? `<a href="#/clients/${client.id}">${escapeHtml(client.name)}</a>` : '—'}</dd>
        <dt>Notes</dt><dd>${escapeHtml(ev.notes || '—').replace(/\n/g, '<br>')}</dd>
      </dl>
    </section>
  `;
}
