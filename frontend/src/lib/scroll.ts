/**
 * Scrolls an element into view when the environment actually supports it.
 *
 * jsdom (and any non-visual renderer) has no scrollIntoView, so calling it directly turns a purely
 * cosmetic nicety into a thrown TypeError inside an event handler — which is what was failing the
 * frontend test gate. Optional chaining guards a null ref, not a missing method.
 */
export function scrollIntoView(element: Element | null | undefined, options?: ScrollIntoViewOptions) {
  if (typeof element?.scrollIntoView === "function") element.scrollIntoView(options);
}
