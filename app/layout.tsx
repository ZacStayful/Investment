import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investment Intelligence Terminal",
  description:
    "Long-horizon investment monitoring and decision-support. Not financial advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-terminal-bg text-terminal-text antialiased">
        {children}
      </body>
    </html>
  );
}
