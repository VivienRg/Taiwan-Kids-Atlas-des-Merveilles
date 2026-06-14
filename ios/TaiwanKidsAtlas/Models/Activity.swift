import Foundation

/// A kid-friendly activity. Mirrors `data/activities.json` (snake_case) 1:1 so the same
/// data files work unchanged. Decoding is deliberately lenient: a single malformed field
/// won't throw — it falls back to a sensible default.
struct Activity: Identifiable, Codable, Hashable {
    let id: String
    var name: String
    var region: String
    var city: String
    var district: String
    var indoorOutdoor: String
    var categories: [String]
    var tags: [String]
    var costRange: String
    var ageRange: [Int]?
    var natural: Bool
    var desc: String
    var website: String?
    var mapLink: String?
    var driveMin: Int?
    var addressEn: String
    var addressQuery: String?

    enum CodingKeys: String, CodingKey {
        case id, name, region, city, district
        case indoorOutdoor = "indoor_outdoor"
        case categories, tags
        case costRange = "cost_range"
        case ageRange = "age_range"
        case natural
        case desc
        case website
        case mapLink = "map_link"
        case driveMin = "drive_min"
        case addressEn = "address_en"
        case addressQuery = "address_query"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let rawName = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? ""
        name = rawName ?? ""

        if let pid = try? c.decodeIfPresent(String.self, forKey: .id), let pid, !pid.isEmpty {
            id = pid
        } else {
            id = Activity.slug(name)
        }

        region = (try? c.decodeIfPresent(String.self, forKey: .region)) ?? "" ?? ""
        city = (try? c.decodeIfPresent(String.self, forKey: .city)) ?? "" ?? ""
        district = (try? c.decodeIfPresent(String.self, forKey: .district)) ?? "" ?? ""
        indoorOutdoor = (try? c.decodeIfPresent(String.self, forKey: .indoorOutdoor)) ?? "" ?? ""
        categories = (try? c.decodeIfPresent([String].self, forKey: .categories)) ?? [] ?? []
        tags = (try? c.decodeIfPresent([String].self, forKey: .tags)) ?? [] ?? []
        costRange = Activity.looseString(c, .costRange) ?? ""
        ageRange = (try? c.decode([Int].self, forKey: .ageRange))
        natural = (try? c.decode(Bool.self, forKey: .natural)) ?? false
        desc = (try? c.decodeIfPresent(String.self, forKey: .desc)) ?? "" ?? ""
        website = (try? c.decodeIfPresent(String.self, forKey: .website)) ?? nil
        mapLink = (try? c.decodeIfPresent(String.self, forKey: .mapLink)) ?? nil
        driveMin = try? c.decode(Int.self, forKey: .driveMin)
        addressEn = (try? c.decodeIfPresent(String.self, forKey: .addressEn)) ?? "" ?? ""
        addressQuery = (try? c.decodeIfPresent(String.self, forKey: .addressQuery)) ?? nil
    }

    /// Memberwise initializer for previews & tests.
    init(id: String, name: String, region: String = "", city: String = "", district: String = "",
         indoorOutdoor: String = "", categories: [String] = [], tags: [String] = [],
         costRange: String = "", ageRange: [Int]? = nil, natural: Bool = false, desc: String = "",
         website: String? = nil, mapLink: String? = nil, driveMin: Int? = nil,
         addressEn: String = "", addressQuery: String? = nil) {
        self.id = id; self.name = name; self.region = region; self.city = city
        self.district = district; self.indoorOutdoor = indoorOutdoor; self.categories = categories
        self.tags = tags; self.costRange = costRange; self.ageRange = ageRange; self.natural = natural
        self.desc = desc; self.website = website; self.mapLink = mapLink; self.driveMin = driveMin
        self.addressEn = addressEn; self.addressQuery = addressQuery
    }

    // MARK: Convenience

    var ageMin: Int { ageRange?.first ?? 0 }
    var ageMax: Int { (ageRange?.count ?? 0) >= 2 ? ageRange![1] : 18 }

    /// "District, City" (and optionally "• Region").
    var locationLine: String {
        let left = [district, city].filter { !$0.isEmpty }.joined(separator: ", ")
        return left.isEmpty ? region : (region.isEmpty ? left : "\(left) • \(region)")
    }

    var primaryCategory: String { categories.first ?? (indoorOutdoor.isEmpty ? "Activity" : indoorOutdoor) }

    /// Maps query used when `map_link` is absent.
    var mapsQuery: String {
        if let q = addressQuery, !q.isEmpty { return q }
        return [name, district, city, region, "Taiwan"].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var lowercasedSearchBlob: String {
        ([name, desc, addressEn] + tags + categories + [district, city, region, costRange])
            .joined(separator: " ").lowercased()
    }

    // MARK: Helpers

    private static func looseString(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> String? {
        if let s = try? c.decodeIfPresent(String.self, forKey: key), let s { return s }
        if let i = try? c.decode(Int.self, forKey: key) { return String(i) }
        if let d = try? c.decode(Double.self, forKey: key) { return String(d) }
        return nil
    }

    static func slug(_ s: String) -> String {
        let lowered = s.folding(options: .diacriticInsensitive, locale: .current).lowercased()
        let mapped = lowered.map { ch -> Character in
            (ch.isLetter && ch.isASCII) || ch.isNumber ? ch : "-"
        }
        let collapsed = String(mapped).split(separator: "-").joined(separator: "-")
        return collapsed.isEmpty ? "activity" : collapsed
    }
}
