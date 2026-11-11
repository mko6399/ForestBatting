import packageJson from '../../package.json';

const API_URL = 'https://thaiforestbathing.com/api';

export const environment = {
  production: true,
  apiUrl: API_URL,
  versionCheckUrl: `${API_URL}/version`,
  appVersion: packageJson.version ?? '0.0.0',
  // When true, AuthService will bypass backend calls and return a mock token/user.
  // You can also toggle at runtime via: localStorage.setItem('bypassAuth','true')
  bypassAuth: false,
  firebase: {
    apiKey: "AIzaSyDRM43ep4kTUH3troqlvFj31U-1sCrijVo",
    authDomain: "botany-notification.firebaseapp.com",
    projectId: "botany-notification",
    storageBucket: "botany-notification.firebasestorage.app",
    messagingSenderId: "949387807243",
    appId: "1:949387807243:web:9cdf21a2160950f050550e"
  },
  vapidKey: 'BNyXdrQ8wd_zjlQy648GFbxUPtMEEtDwtX7k7cJtdvuMVpCn7vLl3w6t7cC2Ha3FdgpGr3qucbP1ZB08cJ6aEA'
};
