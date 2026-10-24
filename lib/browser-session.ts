const eventKey = 'questkeeps:session-change';

let instance = '';

// Message IDs are only used to distinguish tabs, never as authentication tokens.
function messageId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
}

function source() {
  return instance || (instance = messageId());
}

export function announceSessionChange() {
  const message = { source: source(), nonce: messageId() };
  try {
    localStorage.setItem(eventKey, JSON.stringify(message));
  } catch {}
  // Cross-tab notifications are optional: browser privacy restrictions must
  // never turn an already successful login or logout into a failed action.
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('questkeeps-session');
      channel.postMessage(message);
    }
  } catch {
    // The storage event remains available when messaging is restricted.
  } finally {
    try {
      channel?.close();
    } catch {}
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
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined')
      channel = new BroadcastChannel('questkeeps-session');
  } catch {
    // Continue with storage events if the channel cannot be opened.
  }
  if (channel) channel.onmessage = (event) => changed(event.data);
  return () => {
    window.removeEventListener('storage', storage);
    try {
      channel?.close();
    } catch {}
  };
}
