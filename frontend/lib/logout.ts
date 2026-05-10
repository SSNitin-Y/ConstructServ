// frontend/lib/logout.ts
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { clearStoredToken } from "@/lib/authClient";

/**
 * Logs out locally (token + cookie) and also signs out Firebase,
 * so navbar updates immediately and consistently.
 */
export async function fullLogout() {
  // Clear app token (used for API requests)
  clearStoredToken();

  // Clear middleware auth cookie
  await fetch("/api/session", { method: "DELETE" }).catch(() => {});

  // Sign out Firebase so UI (profile name) disappears immediately
  await signOut(auth).catch(() => {});
}
