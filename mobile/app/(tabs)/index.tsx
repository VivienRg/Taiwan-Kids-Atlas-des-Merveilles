import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'

import { Header } from '../../src/components/Header'
import { PlaceCard, LoadingSpinner } from '../../src/components/PlaceCard'
import { ErrorBanner, EmptyState, SectionHeader } from '../../src/components/ui'
import { theme } from '../../src/theme'
import { TOUCH_TARGET } from '../../src/theme'
import { fetchPlaces, fetchEvents } from '../../src/api'
import { loadContentLang, loadUILang } from '../../src/storage/lang'

export default function HomeScreen() {
  const [contentLang, setContentLang] = useState<'en' | 'zh-Hant' | 'ja' | 'ko' | 'zh-Hans'>('en')
  const [uiLang, setUiLang] = useState<'en' | 'zh-Hant'>('en')
  const [places, setPlaces] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [placesError, setPlacesError] = useState<Error | null>(null)
  const [eventsError, setEventsError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadContentLang(), loadUILang()]).then(([content, ui]) => {
      setContentLang(content)
      setUiLang(ui)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setPlacesError(null)
    setEventsError(null)
    try {
      const [placesRes, eventsRes] = await Promise.all([
        fetchPlaces({ lang: contentLang, kid_friendly: true, page_size: 8, sort: 'kid_score' }),
        fetchEvents({ lang: contentLang, page_size: 6, sort: 'date' }),
      ])
      setPlaces(placesRes.data)
      setEvents(eventsRes.data)
    } catch (e) {
      const err = e as Error
      if (!String(err.message).includes('offline')) {
        setPlacesError(err)
        setEventsError(err)
      }
    } finally {
      setLoading(false)
    }
  }, [contentLang])

  useEffect(() => {
    load()
  }, [load])

  const onPlacePress = (place: any) => router.push(`/place/${place.id}`)
  const onEventPress = (id: string) => router.push(`/event/${id}`)
  const onSearch = () => router.push('/explore')

  const eventDate = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header title="Taiwan Kids Atlas" onFavoritesPress={() => router.push('/favorites')} />
      <View style={styles.searchContainer}>
        <TouchableOpacity style={styles.searchBar} onPress={onSearch} accessibilityRole="button" accessibilityLabel="Search places">
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchText}>Search places, cities, districts…</Text>
        </TouchableOpacity>
      </View>

      {loading && <LoadingSpinner />}

      {!loading && placesError && <ErrorBanner error={placesError} onRetry={load} />}

      {!loading &&
        places.length === 0 && !placesError && (
          <EmptyState icon="🔍" titleKey="empty.places" subKey="empty.places_sub" />
        )}

      {!loading && places.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Popular with families" />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            data={places}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: any }) => (
              <PlaceCard place={item} onPress={onPlacePress} lang={uiLang} />
            )}
          />
        </View>
      )}

      {!loading && events.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Upcoming events" />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            data={events}
            keyExtractor={(item) => item.id}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                style={styles.eventCard}
                onPress={() => onEventPress(item.id)}
                accessibilityRole="button"
              >
                <Text style={styles.eventTitle}>{item.name}</Text>
                <Text style={styles.eventVenue}>{item.venue_name ?? ''}</Text>
                <Text style={styles.eventDate}>{eventDate(item.next_starts_at)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {!loading && eventsError && <ErrorBanner error={eventsError} onRetry={load} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.s3,
    marginVertical: theme.spacing.s2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.s4,
    paddingVertical: theme.spacing.s2,
    minHeight: TOUCH_TARGET,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: theme.spacing.s2,
  },
  searchText: {
    fontSize: 15,
    color: theme.colors.muted,
    flex: 1,
  },
  section: {
    marginHorizontal: theme.spacing.s3,
  },
  listContent: {
    paddingRight: theme.spacing.s3,
  },
  eventCard: {
    width: 170,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginRight: theme.spacing.s3,
    padding: theme.spacing.s3,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.s1,
    lineHeight: 20,
  },
  eventVenue: {
    fontSize: 13,
    color: theme.colors.muted,
    marginBottom: theme.spacing.s1,
  },
  eventDate: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '700',
  },
})
