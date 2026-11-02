const fresh = new Map<string, number>();

export function markNotificationFeed(userId: string) {
  fresh.delete(userId);
  fresh.set(userId, Date.now());
  while (fresh.size > 16) fresh.delete(fresh.keys().next().value!);
}

export function notificationFeedFresh(userId: string) {
  return Date.now() - (fresh.get(userId) || 0) < 30000;
}

export function notificationCoordinator(
  userId: string,
  onData: (value: Record<string, any>) => void,
) {
  const fallback = {
    leader: () => true,
    publish: (_value: Record<string, any>) => {},
    close: () => {},
  };
  let channel: BroadcastChannel;
  try {
    if (typeof BroadcastChannel === 'undefined') return fallback;
    channel = new BroadcastChannel('questkeeps:notifications:' + userId);
  } catch {
    return fallback;
  }
  const post = (value: unknown) => {
    try {
      channel.postMessage(value);
    } catch {}
  };
  // Coordination is optional and its identifier is never an authentication token.
  const self =
    String(Date.now()).padStart(16, '0') +
    ':' +
    Math.random().toString(36).slice(2);
  const peers = new Map<string, { at: number; visible: boolean }>();
  let latest = 0;
  let closed = false;
  const beacon = () => {
    peers.set(self, {
      at: Date.now(),
      visible: document.visibilityState === 'visible',
    });
    post({
      type: 'hello',
      id: self,
      visible: document.visibilityState === 'visible',
    });
  };
  channel.onmessage = (event) => {
    const value = event.data;
    if (closed || !value || typeof value.id !== 'string') return;
    if (value.type === 'hello') {
      peers.set(value.id, { at: Date.now(), visible: !!value.visible });
      return;
    }
    if (
      value.type === 'data' &&
      typeof value.at === 'number' &&
      value.at >= latest &&
      value.payload &&
      Array.isArray(value.payload.invitations)
    ) {
      latest = value.at;
      onData(value.payload);
    }
  };
  beacon();
  document.addEventListener('visibilitychange', beacon);
  const timer = setInterval(beacon, 5000);
  return {
    leader: () => {
      const now = Date.now();
      for (const [key, at] of peers) if (now - at.at > 12000) peers.delete(key);
      return ![...peers.entries()].some(
        ([key, peer]) => peer.visible && key < self,
      );
    },
    publish: (payload: Record<string, any>) => {
      if (!closed) {
        latest = Date.now();
        post({ type: 'data', id: self, at: latest, payload });
      }
    },
    close: () => {
      closed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beacon);
      channel.close();
      peers.clear();
    },
  };
}
