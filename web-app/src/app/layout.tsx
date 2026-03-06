import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import CookieConsent from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "FlowShield - AI-Powered Productivity & Focus Management",
  description: "Build better focus habits through structured work sessions, intelligent activity tracking, and actionable analytics.",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
