import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vantage Movers MCP",
  description:
    "Remote MCP server for the Vantage / Granot backend and read-only MongoDB Atlas access.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
