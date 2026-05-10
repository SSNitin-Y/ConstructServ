//frontend/lib/tokenRefresh.ts

import { auth } from "@/lib/firebaseClient";
import { storeToken } from "@/lib/authClient";

/**
 * Attempts to refresh Firebase ID token (silent).
 * Returns the new token string, or null if refresh not possible.
 */
export async function refreshFirebaseToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    // forceRefresh=true requests a fresh ID token
    const token = await user.getIdToken(true);
    storeToken(token);
    return token;
  } catch {
    return null;
  }
}
