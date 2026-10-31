(() => {
  const createSessionId = () => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.random() * 16 | 0;
      const value = character === 'x' ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  };

  const sessionId = createSessionId();
  const lifecycleUrl = (action) => new URL(
    `/__worldworkshop_lifecycle/${action}/${sessionId}`,
    window.location.origin
  ).toString();

  let heartbeatTimer = null;
  let pageClosing = false;

  const send = (action, preferBeacon = false) => {
    const url = lifecycleUrl(action);
    if (preferBeacon && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(url, '')) return;
      } catch { }
    }

    fetch(url, {
      method: 'POST',
      body: '',
      cache: 'no-store',
      credentials: 'same-origin',
      keepalive: true
    }).catch(() => { });
  };

  const heartbeat = () => {
    if (!pageClosing) send('heartbeat');
  };

  const resume = () => {
    pageClosing = false;
    heartbeat();
    if (heartbeatTimer === null) heartbeatTimer = window.setInterval(heartbeat, 10000);
  };

  const closePage = (event) => {
    if (event && event.persisted) return;
    if (pageClosing) return;
    pageClosing = true;
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    send('close', true);
  };

  resume();
  window.addEventListener('pagehide', closePage);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resume();
  });
})();
