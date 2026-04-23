export function printCurrentView(title) {
  const prev = document.title;
  if (title) document.title = title;
  document.body.classList.add('is-printing');
  window.print();
  document.body.classList.remove('is-printing');
  document.title = prev;
}
