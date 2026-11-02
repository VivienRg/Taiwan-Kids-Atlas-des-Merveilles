import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import type { PlaceSummary } from '../types'

const { loadFavorites, addFavorite, removeFavorite } = require('../storage/favorites')

interface FavoritesContextType {
  favorites: string[]
  addFavorite: (id: string) => Promise<void>
  removeFavorite: (id: string) => Promise<void>
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => Promise<void>
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined)

export const FavoritesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadFavorites().then((ids: string[]) => {
      setFavorites(ids)
      setLoaded(true)
    })
  }, [])

  const handleAdd = useCallback(async (id: string) => {
    const next = await addFavorite(id)
    setFavorites(next)
  }, [])

  const handleRemove = useCallback(async (id: string) => {
    const next = await removeFavorite(id)
    setFavorites(next)
  }, [])

  const handleToggle = useCallback(async (id: string) => {
    if (favorites.includes(id)) {
      await handleRemove(id)
    } else {
      await handleAdd(id)
    }
  }, [favorites, handleAdd, handleRemove])

  if (!loaded) {
    return null
  }

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        addFavorite: handleAdd,
        removeFavorite: handleRemove,
        isFavorite: (id: string) => favorites.includes(id),
        toggleFavorite: handleToggle,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext)
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider')
  }
  return context
}

/** Persisted snapshot of a place, kept device-only (contract §1). */
export async function saveFavoriteSnapshot(place: PlaceSummary): Promise<void> {
  try {
    const raw = await __requireStorage().getItem('@taiwankidsatlas/favorite-snapshots')
    const map = raw ? JSON.parse(raw) : {}
    map[place.id] = place
    await __requireStorage().setItem('@taiwankidsatlas/favorite-snapshots', JSON.stringify(map))
  } catch {
    /* storage failures are non-fatal */
  }
}

export async function loadFavoriteSnapshot(id: string): Promise<PlaceSummary | null> {
  try {
    const raw = await __requireStorage().getItem('@taiwankidsatlas/favorite-snapshots')
    if (!raw) return null
    const map = JSON.parse(raw)
    return map[id] ?? null
  } catch {
    return null
  }
}

function __requireStorage() {
  return require('@react-native-async-storage/async-storage')
}
