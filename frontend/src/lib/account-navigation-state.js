export function shouldResetAccountView(event, currentHref) {
  if (!event || event.defaultPrevented) return false;
  if (event.button !== undefined && event.button !== 0) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;

  const link = event.target?.closest?.('a[href]');
  if (!link || link.target?.toLowerCase() === '_blank' || link.hasAttribute?.('download')) return false;

  try {
    const current = new URL(currentHref);
    const destination = new URL(link.href, current);
    if (destination.origin !== current.origin) return false;
    return destination.href !== current.href;
  } catch {
    return false;
  }
}

export function reorderStateAfterNavigation(state, navigationType) {
  if (!['link', 'history', 'restore'].includes(navigationType)) return state;
  return { id: '', busy: false, error: '' };
}

export function shouldResetAccountViewOnRestore(event) {
  return event?.persisted === true;
}
