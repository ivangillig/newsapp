import type { Metadata } from "next";
import { Roboto_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "RSMN. - Resumen de Noticias",
  description: "Resumen diario de noticias con IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${robotoMono.variable} font-mono antialiased bg-black text-white`}
      >
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
