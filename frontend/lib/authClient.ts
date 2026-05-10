// frontend/lib/authClient.ts
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

export const AUTH_TOKEN_KEY = "rukmer_token";

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function storeToken(token: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

// Listen to Firebase auth changes
export function subscribeAuth(cb: (user: AuthUser | null) => void) {
  return onAuthStateChanged(auth, (u) => {
    if (!u) return cb(null);
    cb({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      photoURL: u.photoURL,
    });
  });
}
