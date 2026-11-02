jest.mock('react-native', () => {
  const React = require('react')
  const host = (tag: string) => (props: any) => React.createElement(tag, props, props.children)
  return {
    View: host('View'),
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    Image: host('Image'),
    ActivityIndicator: host('ActivityIndicator'),
    Platform: { OS: 'ios' as const },
    StyleSheet: { create: (obj: any) => obj },
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  Trans: (props: any) => (props.children as any) ?? null,
  initReactI18next: () => () => {},
}))

import { describe, expect, test, jest } from '@jest/globals'
import { create, act } from 'react-test-renderer'
import React from 'react'
import { Text } from 'react-native'

import { PlaceCard } from '../PlaceCard'
import { ErrorBanner, EmptyState } from '../ui'

const place = {
  id: '0f233214-eff7-49d3-95b5-eb83b6a9c73e',
  source: 'curated' as const,
  name: 'Window on China Theme Park',
  name_lang: 'en' as const,
  city_code: '68000',
  city_name: 'Taoyuan City',
  district_code: '68000090',
  district_name: 'Longtan District',
  primary_category: 'theme-park',
  category_slugs: ['theme-park', 'water'],
  kid_tags: ['active', 'family', 'rides'],
  kid_score: 100,
  is_kid_friendly: true,
  age_min: 4,
  age_max: 14,
  indoor_outdoor: 'mixed' as const,
  is_free: false,
  price_level: 2 as const,
  lat: 24.83195,
  lng: 121.18711,
  distance_m: 2181,
  thumbnail_url: 'https://travel.tycg.gov.tw/image/101747/640x480',
  updated_at: '2026-11-02T14:51:27Z',
  total_count: 11,
}

// React 19's test renderer invalidates a root created outside act() when a
// component schedules an update during mount, so all mounts go through act().
const mount = (node: React.ReactElement): ReturnType<typeof create> => {
  let out!: ReturnType<typeof create>
  act(() => {
    out = create(node)
  })
  return out
}

const allText = (renderer: ReturnType<typeof create>): string[] => {
  const root = renderer.root
  return root
    .findAllByType(Text)
    .map((instance: any) => {
      const props = instance.props as { children?: unknown }
      const kids = props.children
      if (Array.isArray(kids)) return kids.filter((k: unknown) => typeof k === 'string').join('')
      if (typeof kids === 'string') return kids
      return ''
    })
    .filter(Boolean)
}

describe('PlaceCard', () => {
  test('renders title, location and kid tags', () => {
    const onPress = jest.fn()
    const renderer = mount(<PlaceCard place={place} onPress={onPress} lang="en" />)
    const texts = allText(renderer)
    expect(texts).toContain('Window on China Theme Park')
    expect(texts).toContain('Longtan District, Taoyuan City')
    expect(texts).toContain('kid_friendly')
    expect(texts).toContain('👨‍👩‍👧 Family-friendly')
  })

  test('calls onPress with the place', () => {
    const onPress = jest.fn()
    const renderer = mount(<PlaceCard place={place} onPress={onPress} lang="en" />)
    const button = renderer.root.findByProps({
      accessibilityLabel: 'Window on China Theme Park, Taoyuan City, Longtan District',
    })
    button.props.onPress()
    expect(onPress).toHaveBeenCalledWith(place)
  })

  test('toggles favorite when not favorited', () => {
    const onToggle = jest.fn()
    const renderer = mount(
      <PlaceCard place={place} onPress={jest.fn()} onToggleFavorite={onToggle} isFavorite={false} lang="en" />
    )
    const button = renderer.root.findByProps({ accessibilityLabel: 'Add to favorites' })
    button.props.onPress({ stopPropagation: jest.fn() })
    expect(onToggle).toHaveBeenCalledWith(place)
  })

  test('toggles favorite when favorited', () => {
    const onToggle = jest.fn()
    const renderer = mount(
      <PlaceCard place={place} onPress={jest.fn()} onToggleFavorite={onToggle} isFavorite={true} lang="en" />
    )
    const button = renderer.root.findByProps({ accessibilityLabel: 'Remove from favorites' })
    button.props.onPress({ stopPropagation: jest.fn() })
    expect(onToggle).toHaveBeenCalledWith(place)
  })
})

describe('ErrorBanner', () => {
  test('shows error message and retry calls handler', () => {
    const onRetry = jest.fn()
    const renderer = mount(<ErrorBanner error={new Error('boom')} onRetry={onRetry} />)
    const texts = allText(renderer)
    expect(texts).toContain('error.title')
    expect(texts).toContain('boom')
    const button = renderer.root.findByProps({ accessibilityLabel: 'error.retry' })
    button.props.onPress()
    expect(onRetry).toHaveBeenCalled()
  })

  test('renders nothing when no error', () => {
    const renderer = mount(<ErrorBanner error={null} onRetry={jest.fn()} />)
    const texts = allText(renderer)
    expect(texts).not.toContain('error.title')
  })
})

describe('EmptyState', () => {
  test('renders icon, title and subtitle', () => {
    const renderer = mount(<EmptyState icon="🔍" titleKey="Custom title" subKey="Custom sub" />)
    const texts = allText(renderer)
    expect(texts).toContain('Custom title')
    expect(texts).toContain('Custom sub')
  })
})
