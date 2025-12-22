import type { Metadata } from 'next'
import { Roboto_Mono, League_Spartan } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
})

const leagueSpartan = League_Spartan({
  subsets: ['latin'],
  variable: '--font-league-spartan',
  weight: ['700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'RSM. - Resumen de Noticias',
  description: 'Resumen diario de noticias con IA',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${robotoMono.variable} ${leagueSpartan.variable} font-mono antialiased bg-black text-white`}
      >
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  )
}
