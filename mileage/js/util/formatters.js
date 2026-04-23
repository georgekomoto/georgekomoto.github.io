export function formatDate(iso) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateInput(iso) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDistance(value, units = 'mi') {
  if (value == null || value === '' || isNaN(value)) return '—';
  const n = Number(value);
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units}`;
}

export function formatMoney(value, currency = 'USD') {
  if (value == null || value === '' || isNaN(value)) return '—';
  try {
    return Number(value).toLocaleString(undefined, { style: 'currency', currency });
  } catch (_) {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const EXPENSE_TYPES = [
  { value: 'toll', label: 'Toll' },
  { value: 'parking', label: 'Parking' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'repair', label: 'Repair' },
  { value: 'tires', label: 'Tires' },
  { value: 'other', label: 'Other' },
];

export function expenseTypeLabel(value) {
  const t = EXPENSE_TYPES.find((x) => x.value === value);
  return t ? t.label : value || '';
}
