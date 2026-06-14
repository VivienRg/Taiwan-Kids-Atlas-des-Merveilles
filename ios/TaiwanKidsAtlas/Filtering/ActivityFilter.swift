import Foundation

/// Pure, side-effect-free filtering & sorting. Ported field-for-field from the web app so
/// behaviour matches exactly. Kept separate from the view model so it's unit-testable.
enum ActivityFilter {

    /// Numeric value of a `cost_range` string. -1 means "unknown".
    /// "0"/"free" -> 0 ; "600+" -> 800 ; "200-600" -> 400 (midpoint) ; "150" -> 150.
    static func priceValue(_ raw: String) -> Int {
        let t = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if t.isEmpty { return -1 }
        if t == "0" || t == "free" { return 0 }

        let nums = t.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
        if t.contains("+"), let n = nums.first { return n + 200 }
        if nums.count >= 2 { return (nums[0] + nums[1]) / 2 }
        if let n = nums.first { return n }
        return -1
    }

    static func priceBucket(of activity: Activity) -> PriceBucket? {
        let v = priceValue(activity.costRange)
        switch v {
        case 0: return .free
        case 1...200: return .low
        case 201...600: return .medium
        case let x where x > 600: return .high
        default: return nil
        }
    }

    static func overlap(_ aMin: Int, _ aMax: Int, _ bMin: Int, _ bMax: Int) -> Bool {
        !(aMax < bMin || bMax < aMin)
    }

    static func matchesFeature(_ feature: Feature, _ a: Activity) -> Bool {
        let tags = Set(a.tags.map { $0.lowercased() })
        switch feature {
        case .dog: return tags.contains("dog friendly")
        case .food: return tags.contains("food")
        case .stroller: return tags.contains("stroller friendly")
        case .indoor: return a.indoorOutdoor.caseInsensitiveCompare("Indoor") == .orderedSame
        case .seasonal: return tags.contains("seasonal")
        }
    }

    static func matches(_ a: Activity, _ s: FilterState) -> Bool {
        let q = s.query.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty, !a.lowercasedSearchBlob.contains(q) { return false }

        if let cat = s.category, !a.categories.contains(cat) { return false }
        if let region = s.region, a.region != region { return false }

        if !overlap(s.minAge, s.maxAge, a.ageMin, a.ageMax) { return false }

        if !s.prices.isEmpty {
            guard let bucket = priceBucket(of: a), s.prices.contains(bucket) else { return false }
        }

        if !s.features.isEmpty {
            for f in s.features where !matchesFeature(f, a) { return false }
        }
        return true
    }

    static func apply(_ data: [Activity], _ s: FilterState) -> [Activity] {
        var list = data.filter { matches($0, s) }
        switch s.sort {
        case .relevance: break
        case .nameAsc:  list.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case .nameDesc: list.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedDescending }
        case .drive:    list.sort { ($0.driveMin ?? .max) < ($1.driveMin ?? .max) }
        case .price:    list.sort { priceValue($0.costRange) < priceValue($1.costRange) }
        }
        return list
    }

    static func categories(in data: [Activity]) -> [String] {
        Set(data.flatMap { $0.categories }).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    static func regions(in data: [Activity]) -> [String] {
        Set(data.map { $0.region }.filter { !$0.isEmpty })
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
}
