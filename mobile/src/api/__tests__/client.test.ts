import { describe, expect, test } from '@jest/globals'
// eslint-disable-next-line import/first
process.env.EXPO_PUBLIC_API_MODE = 'mock'

import { fetchPlaces, fetchPlace, fetchEvents, fetchCategories, fetchAreas, fetchAppMeta } from '../client'

describe('API client (mock mode)', () => {
  test('places_search returns fixtures with pagination', async () => {
    const first = await fetchPlaces({ lang: 'en', page_size: 2, page_offset: 0 })
    expect(first.data.length).toBe(2)
    expect(first.total).toBe(3)

    const second = await fetchPlaces({ lang: 'en', page_size: 2, page_offset: 2 })
    expect(second.data.length).toBe(1)
  })

  test('places_search filters by kid_friendly, categories, city and q', async () => {
    const all = await fetchPlaces({ lang: 'en' })
    const kid = await fetchPlaces({ lang: 'en', kid_friendly: true })
    expect(kid.data.length).toBeLessThanOrEqual(all.data.length)
    kid.data.forEach((p: any) => expect(p.is_kid_friendly).toBe(true))

    const cat = await fetchPlaces({ lang: 'en', categories: ['theme-park'] })
    cat.data.forEach((p: any) => expect(p.category_slugs).toContain('theme-park'))

    const city = await fetchPlaces({ lang: 'en', city: '68000' })
    city.data.forEach((p: any) => expect(p.city_code).toBe('68000'))

    const q = await fetchPlaces({ lang: 'en', q: '牧場' })
    expect(q.data.length).toBe(1)
    expect(q.data[0].name).toContain('牧場')
  })

  test('places_search zh-Hant fixture', async () => {
    const zh = await fetchPlaces({ lang: 'zh-Hant' })
    expect(zh.data.length).toBeGreaterThan(0)
  })

  test('place_detail returns null for unknown ids', async () => {
    const found = await fetchPlace('8462b311-aa38-4dd7-bf1f-d9c06ffdf85e', 'en')
    expect(found?.id).toBe('8462b311-aa38-4dd7-bf1f-d9c06ffdf85e')

    const missing = await fetchPlace('00000000-0000-0000-0000-000000000000', 'en')
    expect(missing).toBeNull()
  })

  test('events_search', async () => {
    const events = await fetchEvents({ lang: 'en', page_size: 5 })
    expect(events.data.length).toBe(3)
    expect(events.total).toBe(3)
  })

  test('categories_list and areas_list', async () => {
    const cats = await fetchCategories('place', 'en')
    expect(cats.length).toBeGreaterThan(0)
    expect(cats[0].slug).toBeDefined()

    const cities = await fetchAreas(null, 'en')
    expect(cities.filter((c: any) => c.level === 'city').length).toBe(22)
  })

  test('app_meta', async () => {
    const meta = await fetchAppMeta('en')
    expect(meta.api_version).toBe('1.0')
    expect(meta.counts.places).toBeGreaterThan(0)
    expect(meta.sources.some((s: any) => s.enabled)).toBe(true)
  })
})
