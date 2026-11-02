import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect } from 'react'

import { FavoritesProvider } from '../src/context/FavoritesContext'
import { queryClient } from '../src/api/hooks'

/**
 * Root layout.
 *
 * - QueryClient with AsyncStorage persistence → last-fetched data available
 *   offline (contract §6: 10 min stale lists, 1 h refs, 24 h gcTime).
 * - FavoritesProvider → device-local favorites.
 * - Root stack: the (tabs) group renders first; place/[id] and event/[id]
 *   are pushed on top so the tab state is preserved when the user backs out.
 *   Deep links kidsatlas://place/<id> and kidsatlas://event/<id>.
 */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'taiwankidsatlas-query-cache',
})

export default function RootLayout() {
  useEffect(() => {
    persistQueryClient({
      queryClient: queryClient,
      persister,
      maxAge: 24 * 60 * 60 * 1000,
    })
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <FavoritesProvider>
        <StatusBar style="auto" />
        <SafeAreaProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)/index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)/explore" options={{ title: 'Explore' }} />
            <Stack.Screen name="(tabs)/map" options={{ title: 'Map' }} />
            <Stack.Screen name="(tabs)/events" options={{ title: 'Events' }} />
            <Stack.Screen name="(tabs)/favorites" options={{ title: 'Favorites' }} />
            <Stack.Screen name="(tabs)/settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="place/[id]" options={{ title: 'Place detail' }} />
            <Stack.Screen name="event/[id]" options={{ title: 'Event detail' }} />
          </Stack>
        </SafeAreaProvider>
      </FavoritesProvider>
    </QueryClientProvider>
  )
}
