import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vouch Dashboard',
  description: 'AI PR analysis for dependency and security findings',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <nav className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/" className="text-sm font-semibold text-emerald-400">
              Vouch
            </Link>
            <Link
              href="/findings"
              className="text-sm text-slate-400 transition hover:text-slate-200"
            >
              Findings
            </Link>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
