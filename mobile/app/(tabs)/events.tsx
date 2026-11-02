import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'

import { Header } from '../../src/components/Header'
import { EmptyState, ErrorBanner, SectionHeader } from '../../src/components/ui'
import { theme, TOUCH_TARGET } from '../../src/theme'
import { useEvents } from '../../src/api/hooks'
import { loadContentLang } from '../../src/storage/lang'
import { toTaipei, formatDateTime } from '../../src/utils'
import type { Lang, EventSummary } from '../../src/types'

export default function EventsScreen() {
  const [contentLang, setContentLang] = useState<Lang>('en')

  useEffect(() => {
    loadContentLang().then(setContentLang)
  }, [])

  const today = toTaipei(new Date().toISOString()).toISOString().slice(0, 10)

  const { data: events = [], isLoading, error, refetch } = useEvents({
    lang: contentLang,
    date_from: today,
    date_to: '',
    sort: 'date',
    page_size: 30,
  })

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Events" />
        <View style={styles.spinner}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Events" />
        <ErrorBanner error={error} onRetry={() => refetch()} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header title="Events" onFavoritesPress={() => router.push('/favorites')} />
      <View style={styles.section}>
        <SectionHeader title="Upcoming events" />
      </View>
      {events.length === 0 && (
        <EmptyState icon="📅" titleKey="empty.events" subKey="empty.places_sub" />
      )}
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }: { item: EventSummary }) => <EventRow event={item} lang={contentLang} />}
      />
    </View>
  )
}

function EventRow({ event, lang }: { event: EventSummary; lang: Lang }) {
  const ongoing =
    event.next_starts_at && event.next_ends_at
      ? new Date(event.next_starts_at) < new Date() && new Date(event.next_ends_at) > new Date()
      : false

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => undefined}
      accessibilityRole="button"
      accessibilityLabel={event.name}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {event.name}
          </Text>
          {event.status === 'cancelled' && (
            <View style={styles.cancelBadge}>
              <Text style={styles.cancelText}>{lang === 'zh-Hant' ? '已取消' : 'Cancelled'}</Text>
            </View>
          )}
          {ongoing && (
            <View style={styles.nowBadge}>
              <Text style={styles.nowText}>{lang === 'zh-Hant' ? '進行中' : 'Now on'}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowMeta}>
          {event.venue_name && (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>📍</Text>
              <Text style={styles.metaText}>{event.venue_name}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaIcon}>📅</Text>
            <Text style={styles.metaText}>{formatDateTime(event.next_starts_at, lang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  section: {
    marginHorizontal: theme.spacing.s3,
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
  row: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.s3,
    marginVertical: theme.spacing.s2,
    overflow: 'hidden',
    minHeight: TOUCH_TARGET,
  },
  rowBody: {
    padding: theme.spacing.s3,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.s2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
    lineHeight: 22,
  },
  cancelBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: theme.spacing.s2,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  cancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  nowBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: theme.spacing.s2,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  nowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  rowMeta: {
    flexDirection: 'row',
    gap: theme.spacing.s4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    fontSize: 14,
    marginRight: theme.spacing.s1,
  },
  metaText: {
    fontSize: 13,
    color: theme.colors.muted,
  },
})
