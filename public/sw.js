// Push notifications for Srijan. The page registers this file; the push service wakes it even when
// the site is closed, which is the whole point of it.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "Srijan", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Srijan", {
      body: d.body || "",
      // Replaces an earlier alert about the same job instead of stacking another one up.
      tag: d.tag || "srijan",
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      icon: "/icon-180.png",
      badge: "/icon-180.png",
      data: { href: d.href || "/" },
    }),
  );
});

// Open the job rather than a fresh copy of the site, reusing a tab that is already there.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(href) && "focus" in c) return c.focus();
      }
      const open = list.find((c) => "focus" in c);
      if (open) return open.focus().then(() => open.navigate(href));
      return self.clients.openWindow(href);
    }),
  );
});
