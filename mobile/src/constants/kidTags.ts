/**
 * Taiwan Kids Atlas — kid tag vocabulary.
 * Contract docs/api-contract.md §5.1. Labels are owned by the app; icons are suggestions.
 * Unknown tags returned by the API are rendered as-is (never crash).
 */
export const KID_TAGS: Record<string, { label: string; labelZhHant: string; emoji: string }> = {
  family: { label: 'Family-friendly', labelZhHant: '親子友善', emoji: '👨‍👩‍👧' },
  playground: { label: 'Playground', labelZhHant: '遊戲場', emoji: '🛝' },
  animals: { label: 'Animals', labelZhHant: '動物', emoji: '🐾' },
  water_play: { label: 'Water play', labelZhHant: '玩水', emoji: '💦' },
  rides: { label: 'Rides', labelZhHant: '遊樂設施', emoji: '🎢' },
  learning: { label: 'Learning', labelZhHant: '寓教於樂', emoji: '📚' },
  diy: { label: 'DIY / hands-on', labelZhHant: '手作體驗', emoji: '🎨' },
  nature: { label: 'Nature', labelZhHant: '自然', emoji: '🌳' },
  active: { label: 'Active', labelZhHant: '活力運動', emoji: '🏃' },
  indoor: { label: 'Indoor', labelZhHant: '室內', emoji: '🏠' },
  outdoor: { label: 'Outdoor', labelZhHant: '戶外', emoji: '☀️' },
  air_con: { label: 'Air-conditioned', labelZhHant: '有冷氣', emoji: '❄️' },
  nursing_room: { label: 'Nursing room', labelZhHant: '哺集乳室', emoji: '🍼' },
  stroller_friendly: { label: 'Stroller-friendly', labelZhHant: '推車友善', emoji: '👶' },
  dog_friendly: { label: 'Dog-friendly', labelZhHant: '寵物友善', emoji: '🐕' },
  food: { label: 'Food on site', labelZhHant: '有餐飲', emoji: '🍜' },
  free: { label: 'Free entry', labelZhHant: '免費', emoji: '🎉' },
  seasonal: { label: 'Seasonal', labelZhHant: '季節限定', emoji: '🌸' },
  shade: { label: 'Shady', labelZhHant: '有遮蔭', emoji: '🌳' },
}

export const kidTagLabel = (tag: string, lang: 'en' | 'zh-Hant'): string => {
  const entry = KID_TAGS[tag]
  if (!entry) return tag
  return lang === 'zh-Hant' ? entry.labelZhHant : entry.label
}

export const kidTagEmoji = (tag: string): string => {
  const entry = KID_TAGS[tag]
  return entry ? entry.emoji : '✨'
}
