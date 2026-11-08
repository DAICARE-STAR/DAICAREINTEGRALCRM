/* Service worker de Web Push del portal. Muestra los avisos que envían las
   Netlify Functions y abre la ruta del aviso al tocar la notificación. */

self.addEventListener('push', function (event) {
  var data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    /* payload no JSON: se usa el texto plano como cuerpo */
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Portal del equipo', {
      body: data.body || 'Hay novedades en el portal.',
      icon: '/brand/logotipo-cuadrado.png',
      badge: '/brand/logotipo-cuadrado.png',
      tag: data.tag || 'aviso',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        if (wins[i].url.indexOf(self.location.origin) === 0 && 'focus' in wins[i]) {
          wins[i].navigate(url)
          return wins[i].focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
