// frontend/app/login/page.tsx
"use client";

import { Suspense, FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeToken } from "@/lib/authClient";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebaseClient";
import { LogIn, Mail, Lock, Chrome } from "lucide-react";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextParam = searchParams.get("next");
  const safeNext = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please enter an email and password.");
      return;
    }

    try {
      setLoading(true);
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCred.user.getIdToken();

      storeToken(token);

      const resp = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ important
        body: JSON.stringify({ token }),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Session cookie failed: ${resp.status} ${txt}`);
      }

      // ✅ ensures middleware sees cookie immediately
      window.location.assign(safeNext);
      // (don’t use router.push here)
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message || "Login failed. Please check your email or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();

      storeToken(token);

      const resp = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ important
        body: JSON.stringify({ token }),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Session cookie failed: ${resp.status} ${txt}`);
      }

      // ✅ ensures middleware sees cookie immediately
      window.location.assign(safeNext);
    } catch (err: any) {
      console.error("Google login error:", err);
      setError(err?.message || "Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-background">
      <div className="container-app py-10">
        <div className="card p-8 md:p-10 overflow-hidden relative max-w-md mx-auto">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] blur-2xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--ring)_14%,transparent)] blur-2xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 badge mb-4">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Sign in
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-muted">Log in to access your media library and jobs.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold">Email</span>
                <div className="mt-2 relative">
                  <Mail className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold">Password</span>
                <div className="mt-2 relative">
                  <Lock className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-10"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </label>

              {error && (
                <div className="card-soft p-3 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]">
                  <p className="text-sm text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]">
                    {error}
                  </p>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                <LogIn className="h-4 w-4" />
                {loading ? "Logging in…" : "Log in"}
              </button>

              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted">OR</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="btn btn-outline w-full"
              >
                <Chrome className="h-4 w-4" />
                Continue with Google
              </button>
            </form>

            <div className="mt-6 text-sm text-muted">
              Don’t have an account?{" "}
              <a href="/signup" className="font-semibold underline">
                Sign up
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
