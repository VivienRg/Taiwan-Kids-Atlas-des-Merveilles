import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native'
import type { PlaceSummary } from '../types'
import { theme, TOUCH_TARGET } from '../theme'
import { kidTagEmoji, kidTagLabel } from '../constants/kidTags'
import { formatDistance, priceLevelLabel } from '../utils'
import { useTranslation } from 'react-i18next'

interface PlaceCardProps {
  place: PlaceSummary
  onPress: (place: PlaceSummary) => void
  onToggleFavorite?: (place: PlaceSummary) => void
  isFavorite?: boolean
  lang?: 'en' | 'zh-Hant'
}

export const PlaceCard: React.FC<PlaceCardProps> = ({
  place,
  onPress,
  onToggleFavorite,
  isFavorite: isFav,
  lang = 'en',
}) => {
  const { t } = useTranslation()
  const thumbnail = place.thumbnail_url
  const tags = (place.kid_tags ?? []).slice(0, 3)

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(place)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={
        lang === 'zh-Hant'
          ? `${place.name}，${place.city_name ?? ''}，${place.district_name ?? ''}`
          : `${place.name}, ${place.city_name ?? ''}, ${place.district_name ?? ''}`
      }
    >
      <View style={styles.imageContainer}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderEmoji}>📍</Text>
          </View>
        )}
        {place.is_kid_friendly && (
          <View style={styles.kidBadge}>
            <Text style={styles.kidBadgeText}>{t('kid_friendly')}</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {place.name}
        </Text>
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.location} numberOfLines={1}>
            {[place.district_name, place.city_name].filter(Boolean).join(', ')}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {place.distance_m != null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>{formatDistance(place.distance_m)}</Text>
            </View>
          )}
          {place.price_level != null && (
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>{priceLevelLabel(place.price_level, lang)}</Text>
            </View>
          )}
        </View>
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>
                  {kidTagEmoji(tag)} {kidTagLabel(tag, lang)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {onToggleFavorite && (
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={(e) => {
            e.stopPropagation()
            onToggleFavorite(place)
          }}
          accessibilityRole="button"
          accessibilityLabel={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Text style={styles.favoriteIcon}>{isFav ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginHorizontal: theme.spacing.s3,
    marginVertical: theme.spacing.s2,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 110,
  },
  imageContainer: {
    width: 110,
    height: 110,
    backgroundColor: theme.colors.elev1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  kidBadge: {
    position: 'absolute',
    top: theme.spacing.s2,
    left: theme.spacing.s2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: theme.spacing.s2,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
  },
  kidBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: theme.spacing.s3,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.s1,
    lineHeight: 22,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s2,
  },
  locationIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  location: {
    fontSize: 13,
    color: theme.colors.muted,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.s2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.s3,
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.muted,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    backgroundColor: theme.colors.chip,
    paddingHorizontal: theme.spacing.s2,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.s2,
    marginBottom: theme.spacing.s1,
  },
  tagText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  favoriteButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    margin: theme.spacing.s2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: TOUCH_TARGET / 2,
  },
  favoriteIcon: {
    fontSize: 22,
  },
})

export const LoadingSpinner = () => (
  <View style={spinnerStyles.container}>
    <ActivityIndicator size="large" color={theme.colors.primary} />
  </View>
)

const spinnerStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.s6,
  },
})
