import { assertEquals, assert, assertThrows } from '../vendor/test_helpers.ts';
import { computeKidScore } from '../rules/kidScore.ts';
import { keywordCodes } from '../rules/keywords.ts';

export function runRulesTests(): void {
  // Taipei Children's Amusement Park (docs/ingestion.md §4.4 golden vector)
  {
    const { score, kidTags } = computeKidScore({
      classes: ['6', '12', '20', '27'],
      name: '臺北市立兒童新樂園',
      description: '親子主題樂園。多元親子體驗。科學教育館與天文館。手作體驗區。不僅是一座遊樂場。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 100);
    assertEquals(kidTags, ['diy', 'family', 'learning', 'playground', 'rides']);
  }
  // Leofoo Village Theme Park
  {
    const { score, kidTags } = computeKidScore({
      classes: ['20'],
      name: '六福村主題遊樂園',
      description: '非洲動物園區與遊樂設施。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 100);
    assertEquals(kidTags, ['animals', 'rides']);
  }
  // Qiaohu Dream Land
  {
    const { score, kidTags } = computeKidScore({
      classes: ['12', '18'],
      name: '巧虎夢想樂園',
      description: '親子互動劇場。森林生態教育中心。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 80);
    assertEquals(kidTags, ['family', 'nature']);
  }
  // Xpark
  {
    const { score, kidTags } = computeKidScore({
      classes: ['12', '18'],
      name: 'Xpark 八景島水族館',
      description: '水族館動物展示與手作體驗。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 70);
    assertEquals(kidTags, ['animals', 'diy', 'nature']);
  }
  // Taipingshan National Forest Recreation Area
  {
    const { score, kidTags } = computeKidScore({
      classes: ['16'],
      name: '太平山國家森林遊樂區',
      description: '常時遇見台灣獼猴、帝雉等動物。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 30);
    assertEquals(kidTags, ['animals', 'nature']);
  }
  // Xiao Ren Guo
  {
    const { score, kidTags } = computeKidScore({
      classes: ['12'],
      name: '小人國',
      description: '主題樂園。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 20);
    assertEquals(kidTags, []);
  }
  // Kinmen Winery: class 14 base 40, negative signal -60 -> 0
  {
    const { score, kidTags } = computeKidScore({
      classes: ['14'],
      name: '金門酒廠',
      description: '酒廠參觀。',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 0);
    assertEquals(kidTags, []);
  }
  // Permanently closed -> 0 regardless of signals
  {
    const { score } = computeKidScore({
      classes: ['26'],
      name: '某動物園',
      description: '',
      tags: [],
      facilities: [],
      isAccessibleForFree: null,
      fees: [],
      serviceStatus: 0,
    });
    assertEquals(score, 0);
  }
  // Nursing room + stroller rental + free entry
  {
    const { score, kidTags } = computeKidScore({
      classes: [],
      name: '公園',
      description: '',
      tags: [],
      facilities: ['3', '56'],
      isAccessibleForFree: 1,
      fees: [],
      serviceStatus: 1,
    });
    assertEquals(score, 35); // nursing_room 20 + stroller_friendly 15
    assertEquals(kidTags, ['free', 'nursing_room', 'stroller_friendly']);
  }
  // keywordCodes
  assertEquals(keywordCodes('臺北市立兒童新樂園'), ['kw:theme-park']);
  assertEquals(keywordCodes('主題遊樂園'), ['kw:theme-park']);
  assertEquals(keywordCodes('森林公園'), ['kw:park']);
  assertEquals(keywordCodes(null), []);
  console.log('ok  rules tests');
}
