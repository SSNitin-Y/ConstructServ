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
