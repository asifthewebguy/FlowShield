import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowShield - AI-Powered Productivity & Focus Management",
  description: "Build better focus habits through structured work sessions, intelligent activity tracking, and actionable analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
