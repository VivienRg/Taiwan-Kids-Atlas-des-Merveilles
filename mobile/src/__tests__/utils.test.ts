import { describe, expect, test } from '@jest/globals'

import { formatDistance, priceLevelLabel, openInMapsUrl } from '../utils'
import { kidTagLabel, kidTagEmoji } from '../constants/kidTags'
import type { PriceLevel } from '../types'

describe('utils', () => {
  test('formatDistance', () => {
    expect(formatDistance(500)).toBe('500 m')
    expect(formatDistance(1500)).toBe('1.5 km')
    expect(formatDistance(null)).toBe('')
  })

  test('priceLevelLabel', () => {
    expect(priceLevelLabel(0, 'en')).toBe('Free')
    expect(priceLevelLabel(3, 'en')).toBe('NT$600+')
    expect(priceLevelLabel(2, 'zh-Hant')).toBe('NT$200–600')
    expect(priceLevelLabel(null, 'en')).toBe('')
  })

  test('openInMapsUrl', () => {
    const withCoords = openInMapsUrl(25.0, 121.5, 'Name', 'Address')
    expect(withCoords).toContain('25,121.5')
    expect(withCoords).toContain('Name')
    const noCoords = openInMapsUrl(null, null, null, 'Some Address')
    expect(noCoords).toContain('Some%20Address')
  })
})

describe('kid tags', () => {
  test('labels and emojis', () => {
    expect(kidTagLabel('family', 'en')).toBe('Family-friendly')
    expect(kidTagLabel('family', 'zh-Hant')).toBe('親子友善')
    expect(kidTagLabel('unknown-tag', 'en')).toBe('unknown-tag')
    expect(kidTagEmoji('animals')).toBe('🐾')
    expect(kidTagEmoji('nope')).toBe('✨')
  })

  test('priceLevelLabel type coverage', () => {
    const levels: PriceLevel[] = [0, 1, 2, 3]
    levels.forEach((l) => {
      expect(priceLevelLabel(l, 'en').length).toBeGreaterThan(0)
    })
  })
})
