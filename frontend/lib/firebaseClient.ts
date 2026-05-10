// frontend/lib/firebaseClient.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence,
  browserSessionPersistence
} from "firebase/auth";

// TODO: replace these values with your own Firebase web app config
// from the Firebase Console (Project settings -> Your apps -> Web app).
const firebaseConfig = {
  apiKey: "AIzaSyCICIKwLbPsblxj15GlkrTRXvbAV923rPE",
  authDomain: "airy-totality-480617-u3.firebaseapp.com",
  projectId: "airy-totality-480617-u3",
  storageBucket: "airy-totality-480617-u3.firebasestorage.app",
  messagingSenderId: "1045276704204",
  appId: "1:1045276704204:web:047b8963ef64ad231f7169",
  measurementId: "G-FB52EBK77P"
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence).catch(() => {
  // If persistence fails for any reason, we don't want the app to crash.
});
// Social login provider: Google
export const googleProvider = new GoogleAuthProvider();
