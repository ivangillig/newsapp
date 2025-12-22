'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface NewsItem {
  headline: string
  content: string
  url?: string // Article URL
}

interface NewsCategory {
  title: string
  items: NewsItem[]
}

// Sortable Category Component
function SortableCategory({
  category,
  onArticleClick,
}: {
  category: NewsCategory
  onArticleClick: (url: string, headline: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.title })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-md font-bold tracking-[0.2em] text-zinc-200 pb-3 border-b border-zinc-800 flex-1">
          {category.title}
        </h2>
        <button
          {...attributes}
          {...listeners}
          className="ml-2 p-2 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing transition"
          title="Arrastrar para reordenar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="12" cy="4" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="12" cy="8" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
          </svg>
        </button>
      </div>
      <div className="space-y-6">
        {category.items.map((item, itemIdx) => (
          <article
            key={itemIdx}
            onClick={() => item.url && onArticleClick(item.url, item.headline)}
            className={item.url ? 'cursor-pointer group' : ''}
          >
            <p className="text-sm text-zinc-400 leading-relaxed">
              <span className="font-bold tracking-wider text-zinc-300 group-hover:text-white transition">
                {item.headline}:
              </span>{' '}
              <span className="group-hover:text-zinc-300 transition">
                {item.content}
              </span>
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [categories, setCategories] = useState<NewsCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneValid, setPhoneValid] = useState<boolean | null>(null)
  const [subLoading, setSubLoading] = useState(false)

  // Estados para el modal de artículo
  const [selectedArticle, setSelectedArticle] = useState<{
    title: string
    content: string
    url: string
    explained?: string
  } | null>(null)
  const [articleLoading, setArticleLoading] = useState(false)

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

  // Remove emojis from text
  const removeEmojis = (text: string) => {
    return text
      .replace(
        /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[📰🏛️💰⚽🌍🔬☁️🚨📊🎯🔑💡✨🔄⏰💬🔍🌧️]/gu,
        ''
      )
      .trim()
  }

  // Parse articles array into categories (without PRINCIPALES)
  const parseSummary = (articles: any[]): NewsCategory[] => {
    try {
      console.log(`📊 Total artículos recibidos: ${articles.length}`)

      // Group articles by category
      const categoriesMap: { [key: string]: NewsItem[] } = {}

      articles.forEach((article: any) => {
        const categoryName = article.category || 'SIN CATEGORÍA'

        // Ignore PRINCIPALES (only for WhatsApp)
        if (categoryName.toLowerCase().includes('principales')) {
          console.log(`⏭️ Skipping PRINCIPALES article: ${article.title}`)
          return
        }

        if (!categoriesMap[categoryName]) {
          categoriesMap[categoryName] = []
        }

        categoriesMap[categoryName].push({
          headline: article.title.toUpperCase(),
          content: article.description,
          url: article.url,
        })
      })

      // Convert to categories array
      const categories: NewsCategory[] = Object.entries(categoriesMap).map(
        ([name, items]) => ({
          title: name.toUpperCase(),
          items,
        })
      )

      const totalDisplayed = categories.reduce(
        (sum, cat) => sum + cat.items.length,
        0
      )
      console.log(`✅ Total artículos mostrados: ${totalDisplayed}`)
      console.log(`📁 Categorías: ${categories.map((c) => c.title).join(', ')}`)

      return categories
    } catch (error) {
      console.error('Error parsing articles:', error)
      return []
    }
  }

  // Load saved category order from localStorage
  const loadCategoryOrder = (categories: NewsCategory[]): NewsCategory[] => {
    if (typeof window === 'undefined') return categories

    const saved = localStorage.getItem('categoryOrder')
    if (!saved) return categories

    try {
      const orderMap: Record<string, number> = JSON.parse(saved)
      return [...categories].sort((a, b) => {
        const orderA = orderMap[a.title] ?? 999
        const orderB = orderMap[b.title] ?? 999
        return orderA - orderB
      })
    } catch {
      return categories
    }
  }

  // Save category order to localStorage
  const saveCategoryOrder = (categories: NewsCategory[]) => {
    if (typeof window === 'undefined') return

    const orderMap = categories.reduce((acc, cat, index) => {
      acc[cat.title] = index
      return acc
    }, {} as Record<string, number>)

    localStorage.setItem('categoryOrder', JSON.stringify(orderMap))
  }

  const fetchNews = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/summary`)
      const data = await res.json()
      if (data.success && data.articles && Array.isArray(data.articles)) {
        console.log('Total articles received:', data.articles.length)
        const parsedCategories = parseSummary(data.articles)
        const orderedCategories = loadCategoryOrder(parsedCategories)
        setCategories(orderedCategories)
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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setCategories((items) => {
        const oldIndex = items.findIndex((item) => item.title === active.id)
        const newIndex = items.findIndex((item) => item.title === over.id)
        const newOrder = arrayMove(items, oldIndex, newIndex)
        saveCategoryOrder(newOrder)
        toast.success('Orden guardado')
        return newOrder
      })
    }
  }

  // Reset category order
  const resetCategoryOrder = () => {
    if (typeof window === 'undefined') return
    localStorage.removeItem('categoryOrder')
    fetchNews()
    toast.success('Orden restablecido')
  }

  // Close modal with ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedArticle) {
        setSelectedArticle(null)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedArticle])

  // Phone validation and formatting
  const handlePhoneChange = (value: string) => {
    setPhone(value)

    if (!value.trim()) {
      setPhoneValid(null)
      return
    }

    try {
      let cleanValue = value.replace(/\s+/g, '').replace(/-/g, '')

      // Auto-add prefixes if missing
      if (!cleanValue.startsWith('+')) {
        if (cleanValue.startsWith('549')) {
          cleanValue = '+' + cleanValue
        } else if (cleanValue.startsWith('54')) {
          // Missing the 9, add it
          cleanValue = '+549' + cleanValue.substring(2)
        } else if (cleanValue.startsWith('9')) {
          cleanValue = '+54' + cleanValue
        } else {
          cleanValue = '+549' + cleanValue
        }
      } else if (
        cleanValue.startsWith('+54') &&
        !cleanValue.startsWith('+549')
      ) {
        // Has +54 but missing the 9
        cleanValue = '+549' + cleanValue.substring(3)
      }

      const phoneNumber = parsePhoneNumber(cleanValue, 'AR')

      // Extra validation: Argentine mobile numbers must have 9 after +54
      const isValid =
        phoneNumber &&
        phoneNumber.isValid() &&
        phoneNumber.number.startsWith('+549')

      setPhoneValid(isValid)
    } catch {
      setPhoneValid(false)
    }
  }

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!phone.trim()) {
      toast.error('Ingresá tu número de WhatsApp')
      return
    }

    try {
      let cleanValue = phone.replace(/\s+/g, '').replace(/-/g, '')

      // Auto-add prefixes if missing
      if (!cleanValue.startsWith('+')) {
        if (cleanValue.startsWith('549')) {
          cleanValue = '+' + cleanValue
        } else if (cleanValue.startsWith('54')) {
          cleanValue = '+549' + cleanValue.substring(2)
        } else if (cleanValue.startsWith('9')) {
          cleanValue = '+54' + cleanValue
        } else {
          cleanValue = '+549' + cleanValue
        }
      } else if (
        cleanValue.startsWith('+54') &&
        !cleanValue.startsWith('+549')
      ) {
        cleanValue = '+549' + cleanValue.substring(3)
      }

      const phoneNumber = parsePhoneNumber(cleanValue, 'AR')

      // Validate and ensure it has +549
      if (
        !phoneNumber ||
        !phoneNumber.isValid() ||
        !phoneNumber.number.startsWith('+549')
      ) {
        toast.error('Número inválido', {
          description: 'Debe ser un celular argentino válido',
        })
        return
      }

      const formattedPhone = phoneNumber.format('E.164')

      setSubLoading(true)
      const res = await fetch(`${API_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('¡Suscripción exitosa!', {
          description: 'Recibirás noticias todos los días a las 6:00 AM',
        })
        setPhone('')
        setPhoneValid(null)
        setShowSubscribe(false)
      } else {
        toast.error('Error al suscribir', {
          description: data.error || 'Intentá nuevamente',
        })
      }
    } catch {
      toast.error('Número inválido', {
        description: 'Verificá que sea un número de WhatsApp válido',
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

  // Toggle with animated transition
  const toggleExplained = () => {
    setIsTransitioning(true)
    // Fade out
    setTimeout(() => {
      setShowExplained(!showExplained)
      // Fade in after change
      setTimeout(() => {
        setIsTransitioning(false)
      }, 100)
    }, 300) // Fade out duration
  }

  return (
    <div className="bg-black text-white h-screen overflow-y-auto">
      {/* Header */}
      <header className="px-8 lg:px-12 py-8">
        <div className="flex justify-between items-start md:items-end">
          <div>
            <a href="/" className="hover:opacity-80 transition">
              <img src="/logo.png" alt="RSM Logo" className="h-16 lg:h-28" />
              {/* <div className="border-8 p-1 border-white bg-black inline-block">
                <h1
                  className="text-5xl lg:text-7xl font-black tracking-tight text-white"
                  style={{
                    fontFamily: 'Montserrat, sans-serif',
                  }}
                >
                  RSM
                </h1>
              </div> */}
            </a>
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
      <div className="text-center py-6 flex items-center justify-center gap-4">
        <svg
          className="w-5 h-5 fill-current text-zinc-400"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
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
            <form onSubmit={handleSubscribe} className="space-y-3">
              <div className="relative">
                <input
                  type="tel"
                  placeholder="11 1234 5678"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`w-full px-4 py-2 bg-black border text-white placeholder-zinc-600 focus:outline-none text-sm tracking-wider transition ${
                    phoneValid === null
                      ? 'border-zinc-700 focus:border-white'
                      : phoneValid
                      ? 'border-green-600 focus:border-green-500'
                      : 'border-red-600 focus:border-red-500'
                  }`}
                />
                {phoneValid !== null && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {phoneValid ? (
                      <svg
                        className="w-5 h-5 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 text-red-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={subLoading || phoneValid === false}
                  className="flex-1 px-6 py-2 bg-white text-black text-sm tracking-wider hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {subLoading ? '...' : 'ENVIAR'}
                </button>
              </div>
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
        /* Grid de categorías con drag and drop */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="px-8 lg:px-12 py-12">
            {/* Reset button */}
            <div className="mb-8 flex justify-end">
              <button
                onClick={resetCategoryOrder}
                className="text-xs tracking-[0.2em] text-zinc-600 hover:text-zinc-300 transition"
              >
                RESTABLECER ORDEN
              </button>
            </div>

            <SortableContext
              items={categories.map((c) => c.title)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 lg:gap-20">
                {categories.map((category) => (
                  <SortableCategory
                    key={category.title}
                    category={category}
                    onArticleClick={handleArticleClick}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
        </DndContext>
      )}

      {/* Footer */}
      <footer className="px-8 lg:px-12 py-10 border-t border-zinc-900">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <a href="/" className="hover:opacity-80 transition">
              <h3 className="text-2xl font-bold tracking-tighter mb-2">
                RSM
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
                  href="mailto:hola@rsm.com.ar"
                  className="hover:text-white transition"
                >
                  contacto@rsm.com.ar
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
            © 2025 RSM. Todos los derechos reservados.
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
          }}
        >
          <div className="min-h-screen px-8 lg:px-16 py-12 flex items-start justify-center">
            <div
              className="max-w-3xl w-full my-12 animate-in slide-in-from-bottom duration-500"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header del modal */}
              <div className="flex justify-between items-start mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  {selectedArticle.title}
                </h1>
                <button
                  onClick={() => {
                    setSelectedArticle(null)
                  }}
                  className="text-zinc-500 hover:text-white text-2xl ml-4 transition"
                >
                  ✕
                </button>
              </div>

              {/* Botón Ver Original - abre el enlace externo */}
              <div className="mb-6">
                <a
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg transition-all duration-300 border border-zinc-700 hover:border-zinc-500"
                >
                  <span className="text-xl">🔗</span>
                  <span className="text-sm font-medium">Ver Original</span>
                </a>
              </div>

              {/* Contenido del artículo - solo muestra la explicación */}
              <div className="prose prose-invert prose-zinc max-w-none">
                <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {selectedArticle.explained || selectedArticle.content}
                </div>
              </div>

              {/* Footer del modal - removido ya que el botón está arriba */}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
