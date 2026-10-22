const key = 'questkeepsNavigation';
const tabs = ['gallery', 'places', 'map', 'notes', 'settings'];
type Entry = { version: 1; back: boolean; tab?: string; sectionSteps?: number };
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
  window.history.replaceState(
    { ...state(), [key]: { version: 1, back, sectionSteps: back ? 1 : 0 } },
    '',
  );
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
  const previous = entry();
  const sameSection =
    section(destination) === section(new URL(window.location.href));
  const steps = sameSection
    ? previous?.sectionSteps
      ? previous.sectionSteps + 1
      : 0
    : 1;
  window.history.pushState(
    {
      ...state(),
      [key]: { version: 1, back: true, tab: safeTab, sectionSteps: steps },
    },
    '',
    destination.href,
  );
}
function section(url: URL) {
  return url.pathname === '/'
    ? url.searchParams.get('trip')
      ? 'trip:' + url.searchParams.get('trip')
      : 'home'
    : url.pathname;
}
export function goBack() {
  initializeNavigation();
  const navigation = (
    window as Window & {
      navigation?: {
        currentEntry?: { index: number };
        entries?: () => { index: number; url: string | null }[];
      };
    }
  ).navigation;
  const current = navigation?.currentEntry;
  if (current && current.index >= 0 && navigation?.entries) {
    const entries = navigation.entries(),
      here = new URL(window.location.href);
    for (let i = current.index - 1; i >= 0; i--) {
      const previous = entries[i];
      if (!previous) break;
      // A no-referrer policy can hide URLs of prior documents. The native
      // canGoBack flag still verifies that this is same-origin history.
      if (!previous.url) {
        if (browserPreviousEntry()) {
          const steps = Math.max(
            current.index - previous.index,
            entry()?.sectionSteps || 0,
          );
          if (window.history.length > steps) window.history.go(-steps);
          else window.location.assign('/');
          return;
        }
        break;
      }
      const url = new URL(previous.url);
      if (url.origin !== here.origin) break;
      if (section(url) !== section(here)) {
        window.history.go(previous.index - current.index);
        return;
      }
    }
    window.location.assign('/');
    return;
  }
  const steps = entry()?.sectionSteps;
  if (steps !== undefined) {
    if (steps > 0 && window.history.length > steps) window.history.go(-steps);
    else window.location.assign('/');
  } else if (
    (browserPreviousEntry() ?? entry()?.back) &&
    window.history.length > 1
  )
    window.history.back();
  else window.location.assign('/');
}
