import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import MapView, { Marker, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { router } from 'expo-router'

import { Header } from '../../src/components/Header'
import { ErrorBanner } from '../../src/components/ui'
import { useMapPlaces } from '../../src/api/hooks'
import { theme, TOUCH_TARGET } from '../../src/theme'
import { loadContentLang } from '../../src/storage/lang'
import type { Lang, MapMarker } from '../../src/types'

const DEFAULT_REGION = {
  latitude: 24.9537,
  longitude: 121.2256,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
}

type RegionChange = Region

export default function MapScreen() {
  const [contentLang, setContentLang] = useState<Lang>('en')
  const [region, setRegion] = useState(DEFAULT_REGION)
  const [error, setError] = useState<Error | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadContentLang().then(setContentLang)
  }, [])

  const bbox = {
    min_lat: region.latitude - region.latitudeDelta / 2,
    min_lng: region.longitude - region.longitudeDelta / 2,
    max_lat: region.latitude + region.latitudeDelta / 2,
    max_lng: region.longitude + region.longitudeDelta / 2,
  }

  const { data: markers = [], isLoading, isError, refetch } = useMapPlaces(
    bbox,
    {},
    contentLang
  )

  useEffect(() => {
    if (isError) setError(new Error('Failed to load map markers'))
  }, [isError])

  const onRegionChange = useCallback((region: Region, _details: any) => {
    if (debounce.current) clearTimeout(debounce.current)
    setRegion(region)
    debounce.current = setTimeout(() => {
      // no-op: the query re-fetches via the bbox state above
    }, 300)
  }, [])

  const totalCount = markers.length > 0 ? (markers[0] as MapMarker & { total_count: number }).total_count ?? 0 : 0
  const showHint = totalCount > 500

  const onPressMarker = (marker: MapMarker) => router.push(`/place/${marker.id}`)

  const onNearMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location permission', 'Allow location access to center the map on you.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = loc.coords
      setRegion({ latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 })
      refetch()
    } catch (e) {
      setError(e as Error)
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header title="Map" />
        <View style={styles.spinner}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Header title="Map" />
      <MapView
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        region={region}
        onRegionChangeComplete={onRegionChange}
        showsMyLocationButton={false}
        showsUserLocation={false}
        pitchEnabled={false}
      >
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.name}
            description={m.is_kid_friendly ? 'Kid-friendly' : ''}
            onPress={() => onPressMarker(m)}
          />
        ))}
      </MapView>
      {error && <ErrorBanner error={error} onRetry={() => refetch()} />}
      {showHint && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Zoom in to see more places</Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.nearMeButton}
        onPress={onNearMe}
        accessibilityRole="button"
        accessibilityLabel="Center map on my location"
      >
        <Text style={styles.nearMeText}>📍 Near me</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: theme.spacing.s1,
  },
  hintText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
  },
  nearMeButton: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.s2,
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  nearMeText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
})
