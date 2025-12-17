'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface NewsItem {
  headline: string
  content: string
  url?: string // URL del artículo
}

interface NewsCategory {
  title: string
  items: NewsItem[]
}

export default function Home() {
  const [categories, setCategories] = useState<NewsCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [phone, setPhone] = useState('')
  const [subLoading, setSubLoading] = useState(false)

  // Estados para el modal de artículo
  const [selectedArticle, setSelectedArticle] = useState<{
    title: string
    content: string
    url: string
    explained?: string
  } | null>(null)
  const [articleLoading, setArticleLoading] = useState(false)
  const [showExplained, setShowExplained] = useState(false) // Toggle entre content y explained
  const [isTransitioning, setIsTransitioning] = useState(false) // Para animar el cambio

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const todayLong = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const todayShort = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  // Quitar emojis del texto
  const removeEmojis = (text: string) => {
    return text
      .replace(
        /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[📰🏛️💰⚽🌍🔬☁️🚨📊🎯🔑💡✨🔄⏰💬🔍🌧️]/gu,
        ''
      )
      .trim()
  }

  // Parsear el summary markdown en categorías (sin PRINCIPALES)
  const parseSummary = (text: string): NewsCategory[] => {
    const categories: NewsCategory[] = []

    // Dividir por ## (categorías)
    const sections = text.split(/\n##\s+/)

    sections.forEach((section) => {
      if (!section.trim()) return

      const lines = section.split('\n')
      let categoryTitle = removeEmojis(lines[0].replace(/^#\s*/, '')).trim()

      // Ignorar PRINCIPALES y secciones especiales
      if (
        categoryTitle.toLowerCase().includes('principales') ||
        categoryTitle.toLowerCase().includes('resumen ejecutivo') ||
        categoryTitle.toLowerCase().includes('bullet') ||
        categoryTitle.toLowerCase().includes('ultra-clave') ||
        categoryTitle === '---'
      ) {
        return
      }

      const items: NewsItem[] = []

      // Procesar cada línea de la sección
      for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim()
        if (!line || line === '---') continue

        // Detectar URLs en formato [URL]
        if (line.match(/^\[https?:\/\//)) {
          // Es una URL, asignarla al último item
          const urlMatch = line.match(/\[(https?:\/\/[^\]]+)\]/)
          if (urlMatch && items.length > 0) {
            console.log('Found URL for item:', urlMatch[1])
            items[items.length - 1].url = urlMatch[1]
          }
          continue
        }

        // Quitar bullet points y asteriscos
        line = line.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '')
        line = removeEmojis(line)

        if (!line) continue

        // Buscar patrón "Título: Contenido"
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0 && colonIndex < 50) {
          const headline = line.substring(0, colonIndex).trim().toUpperCase()
          const content = line.substring(colonIndex + 1).trim()
          if (headline && content) {
            items.push({ headline, content })
          }
        }
      }

      if (categoryTitle && items.length > 0) {
        const cleanTitle = categoryTitle
          .replace(/^#\s*/, '')
          .toUpperCase()
          .trim()
        console.log(
          `Category ${cleanTitle}: ${items.length} items, ${
            items.filter((i) => i.url).length
          } with URLs`
        )
        categories.push({ title: cleanTitle, items })
      }
    })

    return categories
  }

  const fetchNews = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/summary`)
      const data = await res.json()
      if (data.success) {
        console.log('Raw summary:', data.summary.substring(0, 500))
        const parsedCategories = parseSummary(data.summary)
        setCategories(parsedCategories)
      } else {
        setError('No se pudo obtener el resumen')
      }
    } catch (e) {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNews()
  }, [])

  // Cerrar modal con ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedArticle) {
        setSelectedArticle(null)
        setShowExplained(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedArticle])

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('¡Suscripción exitosa!', {
          description: 'Recibirás noticias todos los días a las 6:00 AM',
        })
        setPhone('')
        setShowSubscribe(false)
      } else {
        toast.error('Error al suscribir', {
          description: data.error || 'Intentá nuevamente',
        })
      }
    } catch {
      toast.error('Error de conexión', {
        description: 'Verificá tu conexión a internet',
      })
    } finally {
      setSubLoading(false)
    }
  }

  const handleArticleClick = async (url: string, headline: string) => {
    setArticleLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/api/article?url=${encodeURIComponent(url)}`
      )
      const data = await res.json()
      if (data.success && data.article) {
        setSelectedArticle({
          title: data.article.title || headline,
          content: data.article.content,
          url: data.article.url,
          explained: data.article.explained,
        })
        setShowExplained(false) // Empezar siempre mostrando contenido original
      } else {
        toast.error('Artículo no disponible', {
          description: 'El contenido completo aún no fue procesado',
        })
      }
    } catch {
      toast.error('Error al cargar artículo')
    } finally {
      setArticleLoading(false)
    }
  }

  // Toggle con transición animada
  const toggleExplained = () => {
    setIsTransitioning(true)
    // Fade out
    setTimeout(() => {
      setShowExplained(!showExplained)
      // Fade in después del cambio
      setTimeout(() => {
        setIsTransitioning(false)
      }, 50)
    }, 300) // Duración del fade out
  }

  // Agrupar categorías en filas de 3
  const categoryRows: NewsCategory[][] = []
  for (let i = 0; i < categories.length; i += 3) {
    categoryRows.push(categories.slice(i, i + 3))
  }

  return (
    <div className="bg-black text-white snap-y snap-mandatory h-screen overflow-y-auto">
      {/* Header */}
      <header className="px-8 lg:px-12 py-8 snap-start">
        <div className="flex justify-between items-start md:items-end">
          <div>
            <a href="/" className="hover:opacity-80 transition">
              <h1
                className="text-6xl lg:text-7xl font-black tracking-[-0.04em]"
                style={{ fontFamily: 'var(--font-league-spartan)' }}
              >
                RSMN<span className="text-white">.</span>
              </h1>
            </a>
            <p className="text-xs tracking-[0.3em] text-zinc-500 mt-2 font-mono">
              resumen de noticias
            </p>
          </div>
          <div className="pb-1">
            <p className="hidden md:block text-sm tracking-[0.2em] text-zinc-400 capitalize">
              {todayLong}
            </p>
            <p className="block md:hidden text-xs tracking-[0.15em] text-zinc-400">
              {todayShort}
            </p>
          </div>
        </div>
      </header>

      {/* Subscribe Button */}
      <div className="text-center py-6">
        <button
          onClick={() => setShowSubscribe(!showSubscribe)}
          className="text-sm tracking-[0.3em] text-zinc-400 hover:text-white transition border-b border-zinc-700 pb-1"
        >
          Suscribirme
        </button>
      </div>

      {/* Subscribe Panel */}
      {showSubscribe && (
        <div className="px-8 lg:px-12 pb-8">
          <div className="max-w-md mx-auto">
            <form onSubmit={handleSubscribe} className="flex gap-3">
              <input
                type="tel"
                placeholder="+54 9 11 1234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="flex-1 px-4 py-2 bg-black border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-white text-sm tracking-wider"
              />
              <button
                type="submit"
                disabled={subLoading}
                className="px-6 py-2 bg-white text-black text-sm tracking-wider hover:bg-zinc-200 disabled:opacity-50"
              >
                {subLoading ? '...' : 'ENVIAR'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Estado de carga o error */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-zinc-500 tracking-wider text-sm">
            Cargando noticias...
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-red-400 tracking-wider text-sm">{error}</p>
          <button
            onClick={fetchNews}
            className="mt-4 px-6 py-2 border border-zinc-700 text-sm tracking-wider hover:bg-zinc-900"
          >
            Reintentar
          </button>
        </div>
      ) : (
        /* Filas de categorías - cada fila es un snap point */
        categoryRows.map((row, rowIdx) => (
          <section
            key={rowIdx}
            className="snap-start px-8 lg:px-12 py-12  border-zinc-800"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 lg:gap-20">
              {row.map((category, idx) => (
                <div key={idx} className="space-y-6">
                  <h2 className="text-md font-bold tracking-[0.2em] text-zinc-200 pb-3 border-b border-zinc-800">
                    {category.title}
                  </h2>
                  <div className="space-y-6">
                    {category.items.map((item, itemIdx) => (
                      <article key={itemIdx}>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                          {item.url ? (
                            <button
                              onClick={() =>
                                handleArticleClick(item.url!, item.headline)
                              }
                              className="font-bold tracking-wider text-zinc-300 hover:text-white transition cursor-pointer text-left"
                            >
                              {item.headline}:
                            </button>
                          ) : (
                            <span className="font-bold tracking-wider text-zinc-300">
                              {item.headline}:
                            </span>
                          )}{' '}
                          {item.content}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Footer */}
      <footer className="px-8 lg:px-12 py-10 border-t border-zinc-900">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <a href="/" className="hover:opacity-80 transition">
              <h3 className="text-2xl font-bold tracking-tighter mb-2">
                RSMN.
              </h3>
            </a>
            <p className="text-xs text-zinc-600 tracking-wider">
              resumen de noticias
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.2em] text-zinc-400 mb-4">
              NAVEGACIÓN
            </h4>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li>
                <a href="#" className="hover:text-white transition">
                  Inicio
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  Acerca de
                </a>
              </li>
              <li>
                <button
                  onClick={() => setShowSubscribe(true)}
                  className="hover:text-white transition"
                >
                  Suscribirse
                </button>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.2em] text-zinc-400 mb-4">
              CONTACTO
            </h4>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li>
                <a
                  href="mailto:hola@rsmn.ar"
                  className="hover:text-white transition"
                >
                  hola@rsmn.ar
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.2em] text-zinc-400 mb-4">
              INFO
            </h4>
            <p className="text-sm text-zinc-500">Noticias resumidas con IA.</p>
            <p className="text-sm text-zinc-600 mt-2">
              Todos los días a las 6 AM.
            </p>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 pt-6 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-zinc-600 tracking-wider">
            © 2025 RSMN. Todos los derechos reservados.
          </p>
          <p className="text-xs text-zinc-700 tracking-wider">
            Desarrollado en Argentina por{' '}
            <a
              href="https://github.com/ivangillig"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-white transition"
            >
              Ivan Gillig
            </a>
          </p>
        </div>
      </footer>

      {/* Modal de artículo */}
      {selectedArticle && (
        <div
          className="fixed inset-0 bg-black/95 z-50 overflow-y-auto animate-in fade-in duration-300"
          onClick={() => {
            setSelectedArticle(null)
            setShowExplained(false)
          }}
        >
          <div
            className="min-h-screen px-8 lg:px-16 py-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-3xl mx-auto animate-in slide-in-from-bottom duration-500">
              {/* Header del modal */}
              <div className="flex justify-between items-start mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  {selectedArticle.title}
                </h1>
                <button
                  onClick={() => {
                    setSelectedArticle(null)
                    setShowExplained(false)
                  }}
                  className="text-zinc-500 hover:text-white text-2xl ml-4 transition"
                >
                  ✕
                </button>
              </div>

              {/* Botón Explicame - solo mostrar si hay explained disponible */}
              {selectedArticle.explained && (
                <div className="mb-6">
                  <button
                    onClick={toggleExplained}
                    disabled={isTransitioning}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg transition-all duration-300 border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
                  >
                    <span className="text-xl">✨</span>
                    <span className="text-sm font-medium">
                      {showExplained ? 'Ver Original' : 'Explicame'}
                    </span>
                  </button>
                </div>
              )}

              {/* Contenido del artículo con transición mágica */}
              <div className="prose prose-invert prose-zinc max-w-none relative overflow-hidden">
                <div
                  className="text-zinc-300 leading-relaxed whitespace-pre-wrap transition-all duration-500 ease-out"
                  style={{
                    opacity: isTransitioning ? 0 : 1,
                    transform: isTransitioning
                      ? 'scale(0.98) translateY(10px)'
                      : 'scale(1) translateY(0)',
                  }}
                >
                  {showExplained && selectedArticle.explained
                    ? selectedArticle.explained
                    : selectedArticle.content}
                </div>
              </div>

              {/* Footer del modal */}
              <div className="mt-8 pt-6 border-t border-zinc-800">
                <a
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-500 hover:text-white transition"
                >
                  Ver artículo original →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
