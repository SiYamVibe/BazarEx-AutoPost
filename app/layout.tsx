import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bazarex Autopost - Currency Exchange Automation",
  description: "Automated payment proof sanitization, branding composition, and Facebook publishing tool.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0d0e12] text-gray-100 antialiased selection:bg-[#E5A93C]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
