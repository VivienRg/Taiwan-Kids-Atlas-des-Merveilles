import XCTest
@testable import TaiwanKidsAtlas

final class ActivityDecodingTests: XCTestCase {

    func testDecodesRealShape() throws {
        let json = """
        [{
          "name": "Xpark Aquarium (Qingpu)",
          "region": "Taoyuan", "city": "Taoyuan", "district": "Zhongli",
          "indoor_outdoor": "Indoor",
          "categories": ["Aquarium", "Science"],
          "tags": ["learning", "food"],
          "cost_range": "600+",
          "age_range": [3, 12],
          "natural": false,
          "desc": "Modern aquarium.",
          "website": "https://xpark.com.tw/",
          "map_link": "https://maps.google.com/?q=Xpark",
          "drive_min": 15,
          "address_en": "No. 105, Chunde Rd",
          "id": "xpark-aquarium-qingpu",
          "address_query": "Xpark Aquarium, Zhongli"
        }]
        """.data(using: .utf8)!

        let items = GitHubActivityDataSource.decode(json)
        XCTAssertEqual(items.count, 1)
        let a = items[0]
        XCTAssertEqual(a.id, "xpark-aquarium-qingpu")
        XCTAssertEqual(a.indoorOutdoor, "Indoor")
        XCTAssertEqual(a.ageMin, 3)
        XCTAssertEqual(a.ageMax, 12)
        XCTAssertEqual(a.driveMin, 15)
        XCTAssertEqual(a.categories, ["Aquarium", "Science"])
    }

    func testToleratesMissingFieldsAndGeneratesID() {
        let json = """
        [{ "name": "Mystery Park" }]
        """.data(using: .utf8)!
        let items = GitHubActivityDataSource.decode(json)
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items[0].id, "mystery-park") // slug fallback
        XCTAssertEqual(items[0].ageMin, 0)
        XCTAssertEqual(items[0].ageMax, 18)         // defaults
        XCTAssertNil(items[0].ageRange)
    }

    func testSkipsBadRecordsKeepsGoodOnes() {
        // second element is not an object -> should be skipped, not fatal
        let json = """
        [{ "name": "Good" }, 42, { "name": "Also Good" }]
        """.data(using: .utf8)!
        let items = GitHubActivityDataSource.decode(json)
        XCTAssertEqual(items.map(\.name).sorted(), ["Also Good", "Good"])
    }
}
