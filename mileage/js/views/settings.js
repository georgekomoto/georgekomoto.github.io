import { list, getMeta, setMeta } from '../db.js';
import { escapeHtml } from '../util/formatters.js';
import { downloadBackup, importBackup } from '../util/backup.js';

export async function render(root) {
  const [vehicles, units, currency, defaultVehicleId, lastBackupAt] = await Promise.all([
    list('vehicles'),
    getMeta('units', 'mi'),
    getMeta('currency', 'USD'),
    getMeta('defaultVehicleId', ''),
    getMeta('lastBackupAt', null),
  ]);

  const backupWarning = backupNudge(lastBackupAt);

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <h2>Settings</h2>
      </header>

      ${backupWarning ? `<div class="callout">${backupWarning}</div>` : ''}

      <form class="form" id="settings-form">
        <div class="row-2">
          <label>Default units
            <select name="units">
              <option value="mi" ${units === 'mi' ? 'selected' : ''}>Miles</option>
              <option value="km" ${units === 'km' ? 'selected' : ''}>Kilometers</option>
            </select>
          </label>
          <label>Default currency
            <input name="currency" value="${escapeHtml(currency)}" maxlength="3">
          </label>
        </div>
        <label>Default vehicle
          <select name="defaultVehicleId">
            <option value="">—</option>
            ${vehicles.filter((v) => !v.archived).map((v) => `
              <option value="${v.id}" ${v.id === defaultVehicleId ? 'selected' : ''}>${escapeHtml(v.name || 'Vehicle')}</option>
            `).join('')}
          </select>
        </label>
        <button class="btn btn-primary" type="submit">Save settings</button>
      </form>

      <h3>Backup & restore</h3>
      <p class="muted small">
        Data lives only in this browser. Export a JSON backup regularly so you can
        restore after a browser reset or move to another device.
      </p>
      ${lastBackupAt ? `<p class="muted small">Last backup: ${escapeHtml(new Date(lastBackupAt).toLocaleString())}</p>` : ''}
      <div class="form-actions">
        <button class="btn btn-primary" id="export-backup">Export backup</button>
        <label class="btn">
          <span>Import backup…</span>
          <input type="file" accept="application/json,.json" id="import-input" hidden>
        </label>
      </div>

      <h3 class="muted">Danger zone</h3>
      <p class="muted small">
        To fully reset the app, use the browser's "Clear site data" under
        DevTools → Application. Only do this after you've exported a backup.
      </p>
    </section>
  `;

  root.querySelector('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    await Promise.all([
      setMeta('units', data.units),
      setMeta('currency', (data.currency || 'USD').toUpperCase()),
      setMeta('defaultVehicleId', data.defaultVehicleId || null),
    ]);
    alert('Settings saved.');
  });

  root.querySelector('#export-backup').addEventListener('click', async (e) => {
    e.preventDefault();
    await downloadBackup();
    await setMeta('lastBackupAt', new Date().toISOString());
    render(root);
  });

  root.querySelector('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const mode = confirm(
        'Press OK to REPLACE all existing data with this backup.\n' +
        'Press Cancel to MERGE (keep existing, add missing).',
      ) ? 'replace' : 'merge';
      const summary = await importBackup(payload, mode);
      const lines = Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join('\n');
      alert(`Import complete (${mode}):\n${lines}`);
      render(root);
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
}

function backupNudge(lastBackupAt) {
  if (!lastBackupAt) {
    return `You have not exported a backup yet. <strong>Export one now</strong> — data lives only in this browser.`;
  }
  const age = Date.now() - new Date(lastBackupAt).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days > 7) {
    return `It's been ${Math.floor(days)} days since your last backup. Consider exporting a fresh one.`;
  }
  return null;
}
