/**
 * Scroll a list row (including its expanded editor) fully into view.
 */
export function scrollRowFullyVisible(row: HTMLElement, container: HTMLElement, padding = 8): void {
  const rowRect = row.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const visibleHeight = containerRect.height - padding * 2;

  if (rowRect.height >= visibleHeight) {
    container.scrollTop += rowRect.top - containerRect.top - padding;
    return;
  }

  if (rowRect.top < containerRect.top + padding) {
    container.scrollTop += rowRect.top - containerRect.top - padding;
  } else if (rowRect.bottom > containerRect.bottom - padding) {
    container.scrollTop += rowRect.bottom - containerRect.bottom + padding;
  }
}
