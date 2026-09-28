import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RO Calling Agent - Admin Dashboard",
  description: "AI-Powered Commercial RO Sales & Lead Qualification Calling Agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation */}
          <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-8">
                  <Link href="/" className="flex items-center gap-2">
                    <span className="text-2xl">💧</span>
                    <span className="font-bold text-gray-900 text-lg">AquaPure</span>
                    <span className="text-gray-400 text-sm hidden sm:block">RO Calling Agent</span>
                  </Link>
                  <div className="hidden md:flex items-center gap-6">
                    <Link
                      href="/"
                      className="text-gray-600 hover:text-blue-600 text-sm font-medium transition"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/calls"
                      className="text-gray-600 hover:text-blue-600 text-sm font-medium transition"
                    >
                      All Calls
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 hidden sm:block">Admin Panel</span>
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    A
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
