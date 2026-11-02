import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { Header } from '../../src/components/Header'
import { PlaceCard, LoadingSpinner } from '../../src/components/PlaceCard'
import { ErrorBanner, EmptyState, FilterChip, SectionHeader } from '../../src/components/ui'
import { theme, TOUCH_TARGET } from '../../src/theme'
import { useInfinitePlaces, useCategories } from '../../src/api/hooks'
import { fetchAreas } from '../../src/api'
import { loadContentLang } from '../../src/storage/lang'
import type { PlaceSummary, Lang, Area } from '../../src/types'

type Sort = 'kid_score' | 'name' | 'distance'

export default function ExploreScreen() {
  const [contentLang, setContentLang] = useState<Lang>('en')
  const [query, setQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  const [kidFriendly, setKidFriendly] = useState<boolean | null>(null)
  const [sort, setSort] = useState<Sort>('kid_score')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [cities, setCities] = useState<Area[]>([])

  useEffect(() => {
    loadContentLang().then(setContentLang)
  }, [])

  const { data: categories } = useCategories('place', contentLang)

  useEffect(() => {
    fetchAreas(null, contentLang).then((areas) =>
      setCities(areas.filter((a) => a.level === 'city'))
    )
  }, [contentLang])

  const result = useInfinitePlaces({
    lang: contentLang,
    q: query || undefined,
    categories: selectedCategories.length ? selectedCategories : undefined,
    city: selectedCity || undefined,
    kid_friendly: kidFriendly || undefined,
    sort,
    page_size: 20,
  })

  const pages = result.data?.pages ?? []
  const places = pages.flatMap((p) => p.results)
  const total = pages[0]?.total ?? 0
  const hasMore = result.hasNextPage ?? false
  const isLoadingMore = result.isFetchingNextPage || false

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      result.fetchNextPage?.()
    }
  }, [hasMore, isLoadingMore, result])

  const activeFilterCount =
    (query ? 1 : 0) + selectedCategories.length + (selectedCity ? 1 : 0) + (kidFriendly ? 1 : 0)

  const toggleCategory = useCallback((slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }, [])

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header title="Explore" onFavoritesPress={() => router.push('/favorites')} />
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search places, cities, districts…"
          placeholderTextColor={theme.colors.muted}
          accessibilityRole="search"
        />
        <TouchableOpacity style={styles.filterButton} onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel="Filters">
          <Text style={styles.filterText}>🔍 Filters</Text>
          {activeFilterCount > 0 && (
            <View style={styles.badgeDot}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={filtersOpen}
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.modalBackdrop} />
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity onPress={() => setFiltersOpen(false)} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalSectionTitle}>Categories</Text>
            <View style={styles.chipRow}>
              {(categories ?? []).map((cat) => (
                <FilterChip
                  key={cat.slug}
                  label={cat.name}
                  selected={selectedCategories.includes(cat.slug)}
                  onPress={() => toggleCategory(cat.slug)}
                />
              ))}
            </View>
            <Text style={styles.modalSectionTitle}>City</Text>
            <View style={styles.chipRow}>
              <FilterChip
                label="All cities"
                selected={!selectedCity}
                onPress={() => setSelectedCity(null)}
              />
              {cities.map((c) => (
                <FilterChip
                  key={c.code}
                  label={c.name}
                  selected={selectedCity === c.code}
                  onPress={() => setSelectedCity(c.code)}
                />
              ))}
            </View>
            <Text style={styles.modalSectionTitle}>Kid-friendly</Text>
            <View style={styles.chipRow}>
              <FilterChip label="All" selected={kidFriendly === null} onPress={() => setKidFriendly(null)} />
              <FilterChip label="Kid-friendly only" selected={kidFriendly === true} onPress={() => setKidFriendly(true)} />
            </View>
            <Text style={styles.modalSectionTitle}>Sort by</Text>
            <View style={styles.chipRow}>
              <FilterChip label="Kid-friendly first" selected={sort === 'kid_score'} onPress={() => setSort('kid_score')} />
              <FilterChip label="Name" selected={sort === 'name'} onPress={() => setSort('name')} />
              <FilterChip label="Distance" selected={sort === 'distance'} onPress={() => setSort('distance')} />
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.applyButton} onPress={() => setFiltersOpen(false)} accessibilityRole="button" accessibilityLabel="Apply filters">
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {result.isError && <ErrorBanner error={result.error} onRetry={() => result.refetch()} />}

      {!result.isLoading && places.length === 0 && !result.isError && (
        <EmptyState icon="🔍" titleKey="empty.places" subKey="empty.places_sub" />
      )}

      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: PlaceSummary }) => (
          <PlaceCard
            place={item}
            onPress={(p) => router.push(`/place/${p.id}`)}
            lang={contentLang === 'zh-Hant' ? 'zh-Hant' : 'en'}
          />
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isLoadingMore ? <LoadingSpinner /> : null}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={result.isFetching} onRefresh={() => result.refetch()} />
        }
      />

      {!result.isLoading && places.length > 0 && places.length < total && (
        <Text style={styles.hint}>Showing {places.length} of {total} results</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s2,
    gap: theme.spacing.s2,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.s4,
    paddingVertical: theme.spacing.s2,
    fontSize: 14,
    color: theme.colors.text,
    minHeight: TOUCH_TARGET,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    minWidth: 70,
    backgroundColor: theme.colors.surface,
  },
  badgeDot: {
    marginLeft: theme.spacing.s1,
    backgroundColor: theme.colors.danger,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.muted,
    marginLeft: theme.spacing.s1,
  },
  listContent: {
    paddingBottom: theme.spacing.s6,
  },
  hint: {
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s2,
    fontSize: 13,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.s4,
    paddingVertical: theme.spacing.s4,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  modalClose: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  applyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.s3,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    marginTop: theme.spacing.s3,
  },
  applyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalContent: {
    paddingBottom: theme.spacing.s4,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.muted,
    marginTop: theme.spacing.s3,
    marginBottom: theme.spacing.s2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.s2,
  },
})
