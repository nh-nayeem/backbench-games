import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backbench Games",
  description: "Small multiplayer web games from the back bench."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
