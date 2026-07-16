/** Prints just one of the munkalap's two blocks (Munkamenet vs. the active
 * sub-sheet) — the two toggled via a body class the print CSS checks (see
 * index.css), since @media print can't be driven from inline styles. */
export function printOnly(scope: "munkamenet" | "subsheet") {
  const className = `print-only-${scope}`;
  document.body.classList.add(className);
  const cleanup = () => document.body.classList.remove(className);
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}
