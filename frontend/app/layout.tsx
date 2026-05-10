// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import Link from "next/link";
import AuthNav from "./_components/AuthNav";
import IdleLogoutClient from "@/lib/IdleLogoutClient";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rukmer GPT",
  description: "Rukmer GPT – Analyze your media with AI",
};

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-muted hover:text-foreground transition-colors"
    >
      {label}
    </Link>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = false;


  return (
    <html lang="en">
      <body className={inter.className}>
        <IdleLogoutClient />
        <div className="min-h-screen bg-background text-foreground">
          {/* Top Navbar */}
          <header className="sticky top-0 z-50 border-b border-[color:var(--card-border)] bg-[color:var(--card)] backdrop-blur">
            <div className="container-app py-3 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-primary text-[color:var(--primary-foreground)] flex items-center justify-center text-sm font-extrabold shadow-sm">
                  R
                </div>
                <div className="leading-tight">
                  <div className="font-semibold">Rukmer GPT</div>
                  <div className="text-xs text-muted -mt-0.5">Beta</div>
                </div>
              </Link>

              <nav className="hidden md:flex items-center gap-5">
                <NavLink href="/" label="Home" />
                <NavLink href="/library" label="Library" />
                <NavLink href="/job" label="Jobs" />
                <NavLink href="/analysis" label="Analysis" />
              </nav>

              <AuthNav initialAuthed={authed} />
            </div>
          </header>

          {/* Page Content */}
          <main className="min-h-[calc(100vh-64px)]">{children}</main>

          {/* Footer */}
          <footer className="border-t border-[color:var(--card-border)]">
            <div className="container-app py-6 text-xs text-muted flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Rukmer Inc.</span>
              <span>Rukmer GPT · Beta Version</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
