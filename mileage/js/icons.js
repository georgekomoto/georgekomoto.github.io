// Inline SVG icons (24x24 grid, 2px round strokes). Use icon('name', { size, cls, label }).

const P = {
  road: '<path d="M5.2 11l1.7-4.4A2 2 0 0 1 8.8 5.3h6.4a2 2 0 0 1 1.9 1.3L18.8 11"/><path d="M4 11h16a2 2 0 0 1 2 2v3.5a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H8a2 2 0 0 1-4 0H3a1 1 0 0 1-1-1V13a2 2 0 0 1 2-2z"/><path d="M6.5 14.2h1.2M16.3 14.2h1.2"/>',
  roadFill: '<path fill="currentColor" stroke="none" d="M8.8 4.3h6.4a3 3 0 0 1 2.8 1.9l1.5 3.9A3 3 0 0 1 22 13v3.5a2 2 0 0 1-2 2h-.6a2.5 2.5 0 0 1-4.8 0H9.4a2.5 2.5 0 0 1-4.8 0H4a2 2 0 0 1-2-2V13a3 3 0 0 1 2.5-2.96l1.5-3.84a3 3 0 0 1 2.8-1.9zm0 2a1 1 0 0 0-.93.64L6.6 10h10.8l-1.27-3.06a1 1 0 0 0-.93-.64H8.8z"/><path d="M6 14.2h1.6M16.4 14.2H18" stroke="var(--bg-elevated, #fff)" stroke-width="1.8"/>',
  chart: '<path d="M4 20h16"/><rect x="5" y="11" width="3.5" height="6" rx="1"/><rect x="10.25" y="6" width="3.5" height="11" rx="1"/><rect x="15.5" y="3" width="3.5" height="14" rx="1"/>',
  chartFill: '<path d="M4 20h16"/><rect fill="currentColor" x="5" y="11" width="3.5" height="6" rx="1"/><rect fill="currentColor" x="10.25" y="6" width="3.5" height="11" rx="1"/><rect fill="currentColor" x="15.5" y="3" width="3.5" height="14" rx="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  gearFill: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M10.3 2.2c-.6.2-1 .7-1.1 1.3l-.2 1.4a7.8 7.8 0 0 0-1.4.8l-1.3-.5a1.6 1.6 0 0 0-1.9.7l-1 1.7a1.6 1.6 0 0 0 .3 2l1.1.9a8 8 0 0 0 0 1.6l-1.1.9a1.6 1.6 0 0 0-.3 2l1 1.7c.4.6 1.2.9 1.9.7l1.3-.5c.4.3.9.6 1.4.8l.2 1.4c.1.8.8 1.4 1.6 1.4h2c.8 0 1.5-.6 1.6-1.4l.2-1.4c.5-.2 1-.5 1.4-.8l1.3.5c.7.2 1.5-.1 1.9-.7l1-1.7a1.6 1.6 0 0 0-.3-2l-1.1-.9a8 8 0 0 0 0-1.6l1.1-.9c.6-.5.8-1.3.3-2l-1-1.7a1.6 1.6 0 0 0-1.9-.7l-1.3.5a7.8 7.8 0 0 0-1.4-.8l-.2-1.4A1.6 1.6 0 0 0 13 2h-2c-.2 0-.5 0-.7.2zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  plusBold: '<path d="M12 5v14M5 12h14" stroke-width="2.6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  xmark: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  swap: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  car: '<path d="M5 13l1.6-4.8A2 2 0 0 1 8.5 7h7a2 2 0 0 1 1.9 1.2L19 13"/><path d="M4 13h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1.5a1.5 1.5 0 0 1-3 0h-7a1.5 1.5 0 0 1-3 0H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z"/><path d="M7 16h1M16 16h1"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
  starFill: '<path fill="currentColor" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
  share: '<path d="M12 3v12M12 3l-4 4M12 3l4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.2 16.5H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pencil: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  gauge: '<path d="M4.5 16.5a8.5 8.5 0 1 1 15 0"/><path d="M12 14l3.5-4.5"/><circle cx="12" cy="14.5" r="1.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  pin: '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  download: '<path d="M12 4v11M12 15l-4-4M12 15l4-4"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>',
  upload: '<path d="M12 15V4M12 4l-4 4M12 4l4 4"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>',
  dollar: '<path d="M12 3v18"/><path d="M16.5 7.5A3.5 3.5 0 0 0 13 5h-2.5a3 3 0 0 0 0 6h3a3 3 0 0 1 0 6H11a3.5 3.5 0 0 1-3.5-2.5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 12V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 13v3a6 6 0 0 1-12 0v-1.5L3.6 12a1.4 1.4 0 0 1 2.3-1.6L8 13"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  ellipsis: '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
};

export function icon(name, { size = 24, cls = '', label = '', stroke = 2 } = {}) {
  const path = P[name];
  if (!path) return '';
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${aria}>${path}</svg>`;
}

export const ICON_NAMES = Object.keys(P);
