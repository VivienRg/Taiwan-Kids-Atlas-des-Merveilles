import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, Linking, TouchableOpacity, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'

import { Header } from '../../src/components/Header'
import { ErrorBanner } from '../../src/components/ui'
import { theme, TOUCH_TARGET } from '../../src/theme'
import { usePlace } from '../../src/api/hooks'
import { useFavorites } from '../../src/context/FavoritesContext'
import { loadContentLang } from '../../src/storage/lang'
import { priceLevelLabel, openInMapsUrl, formatPhoneLink } from '../../src/utils'
import { kidTagEmoji, kidTagLabel } from '../../src/constants/kidTags'
import type { Lang } from '../../src/types'

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [contentLang, setContentLang] = useState<Lang>('en')
  const { addFavorite, removeFavorite, isFavorite } = useFavorites()

  useEffect(() => {
    loadContentLang().then(setContentLang)
  }, [])

  const { data: place, isLoading, error, refetch } = usePlace(id, contentLang)

  const fav = isFavorite(id)
  const onToggle = useCallback(async () => {
    if (fav) {
      await removeFavorite(id)
    } else if (place) {
      await addFavorite(id)
    } else {
      await addFavorite(id)
    }
  }, [fav, place, id, addFavorite, removeFavorite])

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

  if (!place) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <Header title="Taiwan Kids Atlas" onFavoritesPress={() => router.push('/favorites')} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{contentLang === 'zh-Hant' ? '此景點已下架。' : 'This place is no longer listed.'}</Text>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backText}>{contentLang === 'zh-Hant' ? '返回' : 'Back'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const image = place.images?.[0]
  const chineseBadge = place.name_lang !== contentLang && contentLang !== 'zh-Hant'

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Header title={place.name} onFavoritesPress={() => router.push('/favorites')} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.favoriteButton, fav && styles.favoriteButtonActive]}
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel={fav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Text style={styles.favoriteIcon}>{fav ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
        {image ? (
          <Image
            source={{ uri: image.url }}
            style={styles.heroImage}
            contentFit="cover"
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroEmoji}>📍</Text>
          </View>
        )}
        <View style={styles.titleBadgeRow}>
          <Text style={styles.title}>{place.name}</Text>
          {chineseBadge && (
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeText}>中文</Text>
            </View>
          )}
        </View>
        <View style={styles.chips}>
          {place.categories.map((c) => (
            <View key={c.slug} style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{c.icon} {c.name}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.description}>
          {place.description ?? (contentLang === 'zh-Hant' ? '暫無說明。' : 'No description available.')}
        </Text>
        <View style={styles.metaGrid}>
          {place.price_level != null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>💰</Text>
              <Text style={styles.metaText}>{priceLevelLabel(place.price_level, contentLang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>
            </View>
          )}
          {(place.age_min != null || place.age_max != null) && (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>👶</Text>
              <Text style={styles.metaText}>
                {contentLang === 'zh-Hant' ? `${place.age_min ?? ''}–${place.age_max ?? ''} 歲` : `${place.age_min ?? 0}–${place.age_max ?? 18} yrs`}
              </Text>
            </View>
          )}
          {place.is_free != null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>{place.is_free ? '🎉' : '💳'}</Text>
              <Text style={styles.metaText}>{contentLang === 'zh-Hant' ? (place.is_free ? '免費' : '收費') : place.is_free ? 'Free' : 'Paid'}</Text>
            </View>
          )}
          {place.indoor_outdoor && (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>{place.indoor_outdoor === 'indoor' ? '🏠' : '☀️'}</Text>
              <Text style={styles.metaText}>{place.indoor_outdoor}</Text>
            </View>
          )}
        </View>
        {place.kid_tags.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Quick info</Text>
            <View style={styles.tagRow}>
              {place.kid_tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{kidTagEmoji(tag)} {kidTagLabel(tag, contentLang === 'zh-Hant' ? 'zh-Hant' : 'en')}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {place.opening_hours || place.opening_hours_text ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Opening hours</Text>
            {place.opening_hours ? (
              place.opening_hours.periods.map((p) => (
                <View key={`${p.opens}-${p.closes}`} style={styles.hoursItem}>
                  <Text style={styles.hoursDays}>{p.days.join(', ')}</Text>
                  <Text style={styles.hoursTime}>{p.opens} – {p.closes}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.hoursText}>{place.opening_hours_text}</Text>
            )}
          </View>
        ) : null}
        {place.address ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address</Text>
            <TouchableOpacity
              style={styles.addressRow}
              onPress={() => {
                const url = openInMapsUrl(place.location?.lat ?? null, place.location?.lng ?? null, place.name, place.address)
                Linking.openURL(url).catch(() => undefined)
              }}
              accessibilityRole="button"
              accessibilityLabel="Open in maps"
            >
              <Text style={styles.addressIcon}>🗺️</Text>
              <Text style={styles.addressText} numberOfLines={2}>{place.address}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {place.phone ? (
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Linking.openURL(formatPhoneLink(place.phone)!).catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel="Call"
          >
            <Text style={styles.actionIcon}>📞</Text>
            <Text style={styles.actionText}>{place.phone}</Text>
          </TouchableOpacity>
        ) : null}
        {place.website_url ? (
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Linking.openURL(place.website_url!).catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel="Visit website"
          >
            <Text style={styles.actionIcon}>🌐</Text>
            <Text style={styles.actionText}>{place.website_url}</Text>
          </TouchableOpacity>
        ) : null}
        {place.attribution && (
          <View style={styles.attribution}>
            <Text style={styles.attributionLabel}>Data: {place.attribution.source_name}</Text>
            <Text style={styles.attributionText}>{place.attribution.text}</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s3,
    paddingTop: theme.spacing.s2,
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
  favoriteButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: TOUCH_TARGET / 2,
  },
  favoriteButtonActive: {
    backgroundColor: theme.colors.danger,
  },
  favoriteIcon: {
    fontSize: 22,
  },
  heroImage: {
    width: '100%',
    height: 260,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.s3,
  },
  heroPlaceholder: {
    width: '100%',
    height: 260,
    backgroundColor: theme.colors.elev1,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.s3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 60,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s3,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 34,
  },
  langBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.s2,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  langBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s2,
  },
  categoryChip: {
    backgroundColor: theme.colors.chip,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: 6,
    marginRight: theme.spacing.s2,
    marginBottom: theme.spacing.s1,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
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
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    backgroundColor: theme.colors.elev1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.s2,
    paddingVertical: 6,
    marginRight: theme.spacing.s2,
    marginBottom: theme.spacing.s1,
  },
  tagText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  hoursItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  hoursDays: {
    fontSize: 13,
    color: theme.colors.muted,
  },
  hoursTime: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  hoursText: {
    fontSize: 13,
    color: theme.colors.muted,
    paddingHorizontal: theme.spacing.s3,
  },
  addressRow: {
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
  addressIcon: {
    fontSize: 18,
    marginRight: theme.spacing.s2,
  },
  addressText: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
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
