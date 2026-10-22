const eventKey = 'questkeeps:session-change';
let instance = '';
function source() {
  return instance || (instance = crypto.randomUUID());
}
export function announceSessionChange() {
  const message = { source: source(), nonce: crypto.randomUUID() };
  try {
    localStorage.setItem(eventKey, JSON.stringify(message));
  } catch {}
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('questkeeps-session');
    channel.postMessage(message);
    channel.close();
  }
}
export function observeSessionChanges() {
  let reloading = false;
  const changed = (message: unknown) => {
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { source?: string }).source === source() ||
      reloading
    )
      return;
    reloading = true;
    window.location.reload();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === eventKey && event.newValue) {
      try {
        changed(JSON.parse(event.newValue));
      } catch {}
    }
  };
  window.addEventListener('storage', storage);
  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('questkeeps-session')
      : null;
  if (channel) channel.onmessage = (event) => changed(event.data);
  return () => {
    window.removeEventListener('storage', storage);
    channel?.close();
  };
}
