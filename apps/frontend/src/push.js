// push.js — browser-side push subscription helper.
//
// Exposes window.CLGPush with three methods:
//   isSupported()  → boolean
//   getStatus()    → 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed'
//   subscribe()    → asks for permission, registers SW, stores subscription on server
//   unsubscribe()  → removes local subscription and tells server to forget it
//
// Designed to be non-intrusive: all work is deferred until a user gesture
// (button click) so the permission prompt only appears when requested.

(function () {
  const BACKEND = (window.BACKEND_URL && window.BACKEND_URL !== '__BACKEND_URL__')
    ? window.BACKEND_URL : '';
  const SW_URL = '/push-sw.js';

  function isSupported() {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function getRegistration() {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    if (reg) return reg;
    return navigator.serviceWorker.register(SW_URL);
  }

  async function getStatus() {
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) return 'unsubscribed';
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'subscribed' : 'unsubscribed';
    } catch (_) {
      return 'unsubscribed';
    }
  }

  async function fetchVapidKey() {
    const res = await fetch(BACKEND + '/api/push/vapid-key', { credentials: 'include' });
    if (!res.ok) throw new Error(`vapid-key ${res.status}`);
    const { key } = await res.json();
    if (!key) throw new Error('vapid-key empty');
    return key;
  }

  async function subscribe() {
    if (!isSupported()) throw new Error('Push notifications not supported in this browser.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notification permission denied.');

    const reg = await getRegistration();
    await navigator.serviceWorker.ready;

    const vapidPublicKey = await fetchVapidKey();
    const appServerKey = urlBase64ToUint8Array(vapidPublicKey);

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    const subJson = sub.toJSON();
    const res = await fetch(BACKEND + '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subJson),
    });
    if (!res.ok) throw new Error(`subscribe ${res.status}`);
    return subJson;
  }

  async function unsubscribe() {
    if (!isSupported()) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const endpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch (_) { /* ignore */ }
      await fetch(BACKEND + '/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    } catch (_) { /* ignore */ }
  }

  window.CLGPush = { isSupported, getStatus, subscribe, unsubscribe };
})();
