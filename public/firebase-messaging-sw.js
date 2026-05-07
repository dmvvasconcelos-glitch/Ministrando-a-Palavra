importScripts('https://www.gstatic.com/firebasejs/10.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAknt5NC-4kjRTF9VIxiVBdgopYqhO5T-0",
  authDomain: "gen-lang-client-0536991907.firebaseapp.com",
  projectId: "gen-lang-client-0536991907",
  storageBucket: "gen-lang-client-0536991907.firebasestorage.app",
  messagingSenderId: "569699813406",
  appId: "1:569699813406:web:975891c6cb76688f59860f"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/bible-icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
