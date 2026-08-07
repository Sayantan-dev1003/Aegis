import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./Providers";

export const metadata: Metadata = {
  title: "Aegis - Fraud Detection Platform",
  description: "Platform for fraud config, review, and monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
