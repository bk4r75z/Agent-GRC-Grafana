import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Assistant GRC",
  description: "Chatbot de veille cyber et réglementaire connecté à Grafana via MCP",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
