import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { theme } from '../../src/theme'

interface HeaderProps {
  title: string
  onFavoritesPress?: () => void
}

export const Header: React.FC<HeaderProps> = ({ title, onFavoritesPress }) => (
  <View style={styles.container}>
    <View style={styles.brand}>
      <Text style={styles.logo}>🏝️</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
    {onFavoritesPress && (
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onFavoritesPress}
        accessibilityRole="button"
        accessibilityLabel="Favorites"
      >
        <Text style={styles.heartIcon}>❤️</Text>
      </TouchableOpacity>
    )}
  </View>
)

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s3,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingTop: Platform.OS === 'ios' ? theme.spacing.s4 : theme.spacing.s2,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    fontSize: 22,
    marginRight: theme.spacing.s2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartIcon: {
    fontSize: 22,
  },
})
