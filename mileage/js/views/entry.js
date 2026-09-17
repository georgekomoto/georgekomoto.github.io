// STUB — replaced by the entry sheet build.
export function mount(root, ctx) {
  root.innerHTML = `<div class="sheet-header"><button class="nav-btn" type="button" id="cancel">Cancel</button><div class="sheet-title" id="sheet-title">Log trip</div><span></span></div><div class="sheet-content"><div class="card"><p class="muted">Entry sheet coming up.</p></div></div>`;
  root.querySelector('#cancel').addEventListener('click', () => ctx.close());
}
