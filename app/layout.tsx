import "./globals.css";
import type { Metadata, Viewport } from "next";
import ClientBoot from "@/components/ClientBoot";

export const metadata: Metadata = {
  title: "Malla de mensajería de emergencia",
  description: "Grupos cerrados para coordinar alertas de emergencia con tu familia, vecinos o equipo de rescate.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        <ClientBoot />
        <main className="mx-auto max-w-md px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
