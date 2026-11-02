import { Tabs } from 'expo-router'
import { Text, View, StyleSheet, Platform } from 'react-native'

const tabBarIcon = (focused: boolean, label: string) => (
  <View style={[styles.iconContainer, focused && styles.iconFocused]}>
    <Text style={styles.iconText}>{label}</Text>
  </View>
)

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => tabBarIcon(focused, '🏝️'),
          tabBarBadge: undefined,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explore', tabBarIcon: ({ focused }) => tabBarIcon(focused, '🔍') }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Map', tabBarIcon: ({ focused }) => tabBarIcon(focused, '🗺️') }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'Events', tabBarIcon: ({ focused }) => tabBarIcon(focused, '🎪') }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: 'Favorites', tabBarIcon: ({ focused }) => tabBarIcon(focused, '❤️') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ focused }) => tabBarIcon(focused, '⚙️') }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    ...(Platform.OS === 'ios' ? { backgroundColor: 'transparent' } : {}),
  },
  iconFocused: {
    backgroundColor: 'rgba(93,107,130,0.12)',
  },
  iconText: {
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 28,
  },
})
