import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Taiwan Kids Atlas — device-local favorites.
 *
 * Favorites never touch the server (contract §1: read-only, anonymous app).
 * PlaceSummary snapshots are keyed by id so a favorite keeps working even
 * after the underlying record changes; offline, the snapshot is all we show.
 */

const KEY = '@taiwankidsatlas/favorites'

export type Favorite = { id: string; snapshot: import('../types').PlaceSummary }

export async function loadFavorites(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function saveFavorites(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ids))
}

export async function addFavorite(id: string): Promise<string[]> {
  const ids = await loadFavorites()
  if (ids.includes(id)) return ids
  const next = [...ids, id]
  await saveFavorites(next)
  return next
}

export async function removeFavorite(id: string): Promise<string[]> {
  const ids = await loadFavorites()
  const next = ids.filter((i) => i !== id)
  await saveFavorites(next)
  return next
}

export async function isFavorite(id: string): Promise<boolean> {
  const ids = await loadFavorites()
  return ids.includes(id)
}
