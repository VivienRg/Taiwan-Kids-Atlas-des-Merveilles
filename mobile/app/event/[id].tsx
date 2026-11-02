import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Linking, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'

import { Header } from '../../src/components/Header'
import { ErrorBanner } from '../../src/components/ui'
import { theme, TOUCH_TARGET } from '../../src/theme'
import { useEvent } from '../../src/api/hooks'
import { loadContentLang } from '../../src/storage/lang'
import { formatDateTime } from '../../src/utils'
import type { Lang, EventDetail } from '../../src/types'

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [contentLang, setContentLang] = useState<Lang>('en')

  useEffect(() => {
    loadContentLang().then(setContentLang)
  }, [])

  const { data: event, isLoading, error, refetch } = useEvent(id, contentLang)

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Taiwan Kids Atlas" onFavoritesPress={() => router.push('/favorites')} />
        <View style={styles.spinner}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Taiwan Kids Atlas" onFavoritesPress={() => router.push('/favorites')} />
        <ErrorBanner error={error} onRetry={() => refetch()} />
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Taiwan Kids Atlas" onFavoritesPress={() => router.push('/favorites')} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{contentLang === 'zh-Hant' ? '此活動已下架。' : 'This event is no longer listed.'}</Text>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backText}>{contentLang === 'zh-Hant' ? '返回' : 'Back'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const ongoing =
    event.starts_at && event.ends_at
      ? new Date(event.starts_at) < new Date() && new Date(event.ends_at) > new Date()
      : false

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header title={event.name} onFavoritesPress={() => router.push('/favorites')} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroEmoji}>🎪</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{event.name}</Text>
          {event.status === 'cancelled' && (
            <View style={styles.cancelBadge}>
              <Text style={styles.cancelText}>{contentLang === 'zh-Hant' ? '已取消' : 'Cancelled'}</Text>
            </View>
          )}
          {ongoing && (
            <View style={styles.nowBadge}>
              <Text style={styles.nowText}>{contentLang === 'zh-Hant' ? '進行中' : 'Now on'}</Text>
            </View>
          )}
        </View>
        <Text style={styles.description}>{event.description ?? (contentLang === 'zh-Hant' ? '暫無說明。' : 'No description available.')}</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaIcon}>📅</Text>
            <Text style={styles.metaText}>{formatDateTime(event.starts_at, contentLang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>
          </View>
          {event.ends_at && (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>🏁</Text>
              <Text style={styles.metaText}>{formatDateTime(event.ends_at, contentLang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaIcon}>{event.is_free ? '🎉' : '💳'}</Text>
            <Text style={styles.metaText}>{contentLang === 'zh-Hant' ? (event.is_free ? '免費' : event.price_text ?? '收費') : event.price_text ?? 'Paid'}</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Occurrences</Text>
          <FlatList
            data={event.occurrences}
            keyExtractor={(item, i) => String(i)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }: { item: EventDetail['occurrences'][number] }) => (
              <View style={styles.occurrenceRow}>
                <Text style={styles.occurrenceTime}>{formatDateTime(item.starts_at, contentLang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>
                {item.ends_at && <Text style={styles.occurrenceTime}> – {formatDateTime(item.ends_at, contentLang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>}
                <Text style={styles.occurrenceVenue}>{item.venue_name ?? ''}</Text>
              </View>
            )}
          />
        </View>
        {event.organizer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Organizer</Text>
            <Text style={styles.venueText}>{event.organizer}</Text>
          </View>
        )}
        {event.place_id && (
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push(`/place/${event.place_id}`)}
            accessibilityRole="button"
            accessibilityLabel="Open related place"
          >
            <Text style={styles.actionIcon}>📍</Text>
            <Text style={styles.actionText}>{contentLang === 'zh-Hant' ? '開啟地點' : 'Open place'}</Text>
          </TouchableOpacity>
        )}
        {event.ticket_url ? (
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Linking.openURL(event.ticket_url!).catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel="Get tickets"
          >
            <Text style={styles.actionIcon}>🎟️</Text>
            <Text style={styles.actionText}>{contentLang === 'zh-Hant' ? '購票' : 'Get tickets'}</Text>
          </TouchableOpacity>
        ) : null}
        {event.website_url ? (
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Linking.openURL(event.website_url!).catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel="Visit website"
          >
            <Text style={styles.actionIcon}>🌐</Text>
            <Text style={styles.actionText}>{event.website_url}</Text>
          </TouchableOpacity>
        ) : null}
        {event.attribution && (
          <View style={styles.attribution}>
            <Text style={styles.attributionLabel}>Data: {event.attribution.source_name}</Text>
            <Text style={styles.attributionText}>{event.attribution.text}</Text>
          </View>
        )}
      </View>
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
  body: {
    paddingHorizontal: theme.spacing.s3,
    paddingBottom: theme.spacing.s6,
  },
  headerRow: {
    paddingHorizontal: theme.spacing.s3,
    paddingTop: theme.spacing.s2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: TOUCH_TARGET / 2,
  },
  backIcon: {
    fontSize: 22,
    color: theme.colors.text,
  },
  heroPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: theme.colors.elev1,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.s3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 60,
  },
  titleRow: {
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 32,
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
  description: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s3,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.s3,
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s3,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.s5,
    marginBottom: theme.spacing.s2,
  },
  metaIcon: {
    fontSize: 18,
    marginRight: theme.spacing.s1,
  },
  metaText: {
    fontSize: 13,
    color: theme.colors.muted,
  },
  section: {
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.spacing.s2,
  },
  listContent: {
    paddingBottom: theme.spacing.s2,
  },
  occurrenceRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  occurrenceTime: {
    fontSize: 13,
    color: theme.colors.muted,
  },
  occurrenceVenue: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    marginLeft: theme.spacing.s2,
    flex: 1,
  },
  venueText: {
    fontSize: 13,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.s3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s2,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s2,
    minHeight: TOUCH_TARGET,
  },
  actionIcon: {
    fontSize: 18,
    marginRight: theme.spacing.s2,
  },
  actionText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  attribution: {
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s5,
    padding: theme.spacing.s3,
    backgroundColor: theme.colors.elev1,
    borderRadius: theme.radius.md,
  },
  attributionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.muted,
    marginBottom: theme.spacing.s1,
  },
  attributionText: {
    fontSize: 12,
    color: theme.colors.muted,
    lineHeight: 18,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.s6,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.s3,
    textAlign: 'center',
  },
  back: {
    marginTop: theme.spacing.s4,
  },
  backText: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: '700',
  },
})
