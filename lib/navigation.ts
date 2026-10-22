const key = 'questkeepsNavigation';
const tabs = ['gallery', 'places', 'map', 'notes', 'settings'];
type Entry = { version: 1; back: boolean; tab?: string };
function entry(): Entry | undefined {
  const value = window.history.state?.[key];
  if (value?.version === 1 && typeof value.back === 'boolean') return value;
}
function state() {
  const value = window.history.state;
  return value && typeof value === 'object' ? value : {};
}
function browserPreviousEntry(): boolean | undefined {
  // Navigation API limits back traversal to contiguous same-origin entries,
  // even when the site's no-referrer policy deliberately hides document.referrer.
  const navigation = (
    window as Window & { navigation?: { canGoBack: boolean } }
  ).navigation;
  return typeof navigation?.canGoBack === 'boolean'
    ? navigation.canGoBack
    : undefined;
}
export function initializeNavigation() {
  if (entry()) return;
  let back = false;
  try {
    back =
      window.history.length > 1 &&
      !!document.referrer &&
      new URL(document.referrer).origin === window.location.origin;
  } catch {}
  back = browserPreviousEntry() ?? back;
  window.history.replaceState({ ...state(), [key]: { version: 1, back } }, '');
}
export function navigationTab() {
  const tab = entry()?.tab;
  return tab && tabs.includes(tab) ? tab : 'gallery';
}
export function pushNavigation(path: string, tab = 'gallery') {
  initializeNavigation();
  const destination = new URL(path, window.location.href);
  if (destination.origin !== window.location.origin)
    throw Error('Internal navigation only');
  const safeTab = tabs.includes(tab) ? tab : 'gallery';
  if (destination.href === window.location.href && safeTab === navigationTab())
    return;
  window.history.pushState(
    { ...state(), [key]: { version: 1, back: true, tab: safeTab } },
    '',
    destination.href,
  );
}
export function goBack() {
  initializeNavigation();
  if ((browserPreviousEntry() ?? entry()?.back) && window.history.length > 1)
    window.history.back();
  else window.location.assign('/');
}
