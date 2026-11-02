import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'

import { Header } from '../../src/components/Header'
import { PlaceCard } from '../../src/components/PlaceCard'
import { EmptyState } from '../../src/components/ui'
import { theme } from '../../src/theme'
import { useFavorites } from '../../src/context/FavoritesContext'
import { loadFavoriteSnapshot } from '../../src/context/FavoritesContext'
import type { PlaceSummary } from '../../src/types'

export default function FavoritesScreen() {
  const { favorites, removeFavorite, isFavorite } = useFavorites()
  const [snapshots, setSnapshots] = useState<Record<string, PlaceSummary>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const map: Record<string, PlaceSummary> = {}
      for (const id of favorites) {
        const snap = await loadFavoriteSnapshot(id)
        if (snap) map[id] = snap
      }
      if (!cancelled) {
        setSnapshots(map)
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [favorites])

  const ordered = favorites.map((id) => snapshots[id]).filter(Boolean) as PlaceSummary[]

  if (!loaded) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Favorites" />
        <View style={styles.spinner} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header title="Favorites" />
      {ordered.length === 0 ? (
        <EmptyState
          icon="❤️"
          titleKey="empty.favorites"
          subKey="empty.favorites_sub"
          onClear={() => undefined}
          clearLabelKey=""
        />
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: PlaceSummary }) => (
            <PlaceCard
              place={item}
              onPress={(p) => router.push(`/place/${p.id}`)}
              onToggleFavorite={(p) => removeFavorite(p.id)}
              isFavorite={isFavorite(item.id)}
            />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  spinner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.s6,
  },
  listContent: {
    paddingBottom: theme.spacing.s6,
  },
})
