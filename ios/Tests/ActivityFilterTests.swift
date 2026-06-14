import XCTest
@testable import TaiwanKidsAtlas

final class ActivityFilterTests: XCTestCase {

    // MARK: price parsing & buckets

    func testPriceValue() {
        XCTAssertEqual(ActivityFilter.priceValue("0"), 0)
        XCTAssertEqual(ActivityFilter.priceValue("free"), 0)
        XCTAssertEqual(ActivityFilter.priceValue("600+"), 800)
        XCTAssertEqual(ActivityFilter.priceValue("200-600"), 400)
        XCTAssertEqual(ActivityFilter.priceValue("200–600"), 400) // en-dash
        XCTAssertEqual(ActivityFilter.priceValue("150"), 150)
        XCTAssertEqual(ActivityFilter.priceValue(""), -1)
    }

    func testPriceBuckets() {
        XCTAssertEqual(ActivityFilter.priceBucket(of: make(cost: "0")), .free)
        XCTAssertEqual(ActivityFilter.priceBucket(of: make(cost: "100")), .low)
        XCTAssertEqual(ActivityFilter.priceBucket(of: make(cost: "200-600")), .medium)
        XCTAssertEqual(ActivityFilter.priceBucket(of: make(cost: "600+")), .high)
    }

    // MARK: age overlap

    func testAgeOverlap() {
        XCTAssertTrue(ActivityFilter.overlap(0, 18, 3, 12))
        XCTAssertTrue(ActivityFilter.overlap(10, 18, 3, 12))   // touches
        XCTAssertFalse(ActivityFilter.overlap(13, 18, 3, 12))  // disjoint
    }

    func testAgeFilterUsesOverlapNotContainment() {
        let a = make(age: [3, 6])
        var f = FilterState(); f.minAge = 5; f.maxAge = 10
        XCTAssertTrue(ActivityFilter.matches(a, f)) // 5...10 overlaps 3...6
    }

    // MARK: features

    func testFeatureFilters() {
        let dog = make(tags: ["dog friendly", "food"])
        XCTAssertTrue(ActivityFilter.matchesFeature(.dog, dog))
        XCTAssertTrue(ActivityFilter.matchesFeature(.food, dog))
        XCTAssertFalse(ActivityFilter.matchesFeature(.seasonal, dog))

        let indoor = make(indoor: "Indoor")
        XCTAssertTrue(ActivityFilter.matchesFeature(.indoor, indoor))
    }

    // MARK: search

    func testSearchAcrossFields() {
        let a = make(name: "Xpark Aquarium", tags: ["penguins"], city: "Taoyuan")
        XCTAssertTrue(ActivityFilter.matches(a, query("aquarium")))
        XCTAssertTrue(ActivityFilter.matches(a, query("penguins")))
        XCTAssertTrue(ActivityFilter.matches(a, query("taoyuan")))
        XCTAssertFalse(ActivityFilter.matches(a, query("zoo")))
    }

    // MARK: sort

    func testSort() {
        let data = [make(name: "B", drive: 30, cost: "600+"),
                    make(name: "A", drive: 10, cost: "0")]
        var f = FilterState(); f.sort = .nameAsc
        XCTAssertEqual(ActivityFilter.apply(data, f).map(\.name), ["A", "B"])
        f.sort = .drive
        XCTAssertEqual(ActivityFilter.apply(data, f).first?.driveMin, 10)
        f.sort = .price
        XCTAssertEqual(ActivityFilter.apply(data, f).first?.costRange, "0")
    }

    // MARK: helpers

    private func query(_ q: String) -> FilterState { var f = FilterState(); f.query = q; return f }

    private func make(name: String = "Place", tags: [String] = [], categories: [String] = [],
                      cost: String = "", age: [Int]? = nil, indoor: String = "",
                      drive: Int? = nil, city: String = "") -> Activity {
        Activity(id: Activity.slug(name), name: name, city: city, indoorOutdoor: indoor,
                 categories: categories, tags: tags, costRange: cost, ageRange: age, driveMin: drive)
    }
}
