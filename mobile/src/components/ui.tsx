import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import type { ApiError } from '../api/client'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

declare const navigator: { onLine: boolean } | undefined

interface ErrorBannerProps {
  error: Error | null | undefined
  onRetry: () => void
  titleKey?: string
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, onRetry, titleKey }) => {
  const { t } = useTranslation()
  if (!error) return null
  const apiError = error as ApiError & { status?: number }
  const isOffline = apiError.status === 0 && !navigatorOnLine()

  return (
    <View style={errorStyles.container}>
      <View style={errorStyles.body}>
        <Text style={errorStyles.icon}>{isOffline ? '📴' : '⚠️'}</Text>
        <View style={errorStyles.texts}>
          <Text style={errorStyles.title}>
            {isOffline ? t('offline.title') : titleKey ? t(titleKey) : t('error.title')}
          </Text>
          <Text style={errorStyles.message}>
            {isOffline ? t('offline.sub') : apiError.message ?? t('error.title')}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={errorStyles.button}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('error.retry')}
      >
        <Text style={errorStyles.buttonText}>{t('error.retry')}</Text>
      </TouchableOpacity>
    </View>
  )
}

function navigatorOnLine(): boolean {
  return typeof navigator !== 'undefined' ? !!navigator.onLine : true
}

const errorStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF3C7',
    borderColor: theme.colors.warning,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.s3,
    marginVertical: theme.spacing.s2,
    overflow: 'hidden',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.s4,
  },
  icon: {
    fontSize: 20,
    marginRight: theme.spacing.s3,
  },
  texts: { flex: 1 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7C3AED',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: '#4C1D95',
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.s4,
    paddingVertical: theme.spacing.s2,
    alignSelf: 'flex-start',
    minWidth: 70,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
})

interface OfflineBannerProps {
  visible: boolean
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ visible }) => {
  const { t } = useTranslation()
  if (!visible) return null
  return (
    <View style={offlineStyles.container}>
      <Text style={offlineStyles.text}>{t('offline.title')} — {t('offline.sub')}</Text>
    </View>
  )
}

const offlineStyles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.elev1,
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s1,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: theme.colors.muted,
    fontWeight: '600',
  },
})

interface EmptyStateProps {
  icon: string
  titleKey: string
  subKey: string
  onClear?: () => void
  clearLabelKey?: string
  visible?: boolean
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  titleKey,
  subKey,
  onClear,
  clearLabelKey,
  visible = true,
}) => {
  const { t } = useTranslation()
  if (!visible) return null
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{icon}</Text>
      <Text style={emptyStyles.title}>{t(titleKey)}</Text>
      <Text style={emptyStyles.sub}>{t(subKey)}</Text>
      {onClear && clearLabelKey && (
        <TouchableOpacity
          style={emptyStyles.clearButton}
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t(clearLabelKey)}
        >
          <Text style={emptyStyles.clearText}>{t(clearLabelKey)}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s6,
    paddingTop: 60,
  },
  icon: {
    fontSize: 56,
    marginBottom: theme.spacing.s3,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.s1,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.s4,
  },
  clearButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.s4,
    paddingVertical: theme.spacing.s2,
    borderRadius: theme.radius.full,
  },
  clearText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
})

interface FilterChipProps {
  label: string
  selected: boolean
  onPress: () => void
}

export const FilterChip: React.FC<FilterChipProps> = ({ label, selected, onPress }) => (
  <TouchableOpacity
    style={[chipStyles.chip, selected && chipStyles.chipSelected]}
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    accessibilityLabel={label}
  >
    <Text style={[chipStyles.chipText, selected && chipStyles.chipTextSelected]}>{label}</Text>
  </TouchableOpacity>
)

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: theme.spacing.s4,
    paddingVertical: theme.spacing.s2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.chip,
    marginRight: theme.spacing.s2,
    marginBottom: theme.spacing.s2,
    minWidth: 70,
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: theme.colors.dark,
    borderColor: theme.colors.surface,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.muted,
  },
  chipTextSelected: {
    color: theme.colors.surface,
  },
})

interface SectionHeaderProps {
  title: string
  subtitle?: string
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle }) => (
  <View style={headerStyles.container}>
    <Text style={headerStyles.title}>{title}</Text>
    {subtitle && <Text style={headerStyles.sub}>{subtitle}</Text>}
  </View>
)

const headerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.s3,
    marginTop: theme.spacing.s2,
    marginBottom: theme.spacing.s2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sub: {
    fontSize: 13,
    color: theme.colors.muted,
    marginTop: 4,
  },
})
