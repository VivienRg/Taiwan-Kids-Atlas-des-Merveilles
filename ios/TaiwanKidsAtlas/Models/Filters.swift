import Foundation

/// Price buckets, mirroring the web app's free / low / medium / high logic.
enum PriceBucket: String, CaseIterable, Identifiable, Hashable {
    case free, low, medium, high
    var id: String { rawValue }
    var label: String {
        switch self {
        case .free: return "Free"
        case .low: return "NT$1–200"
        case .medium: return "NT$200–600"
        case .high: return "NT$600+"
        }
    }
}

/// Feature toggles, keyed off tags / indoor flag (same rules as the web app).
enum Feature: String, CaseIterable, Identifiable, Hashable {
    case dog, food, stroller, indoor, seasonal
    var id: String { rawValue }
    var label: String {
        switch self {
        case .dog: return "Dog friendly"
        case .food: return "Food nearby"
        case .stroller: return "Stroller friendly"
        case .indoor: return "Indoor"
        case .seasonal: return "Seasonal"
        }
    }
    var systemImage: String {
        switch self {
        case .dog: return "pawprint"
        case .food: return "fork.knife"
        case .stroller: return "stroller"
        case .indoor: return "house"
        case .seasonal: return "leaf"
        }
    }
}

enum SortOption: String, CaseIterable, Identifiable, Hashable {
    case relevance, nameAsc, nameDesc, drive, price
    var id: String { rawValue }
    var label: String {
        switch self {
        case .relevance: return "Relevance"
        case .nameAsc: return "Name A→Z"
        case .nameDesc: return "Name Z→A"
        case .drive: return "Drive time"
        case .price: return "Price"
        }
    }
}

/// The full UI filter/sort/search state. Value type so it's trivial to copy, reset and test.
struct FilterState: Equatable {
    var query: String = ""
    var category: String? = nil
    var region: String? = nil
    var minAge: Int = 0
    var maxAge: Int = 18
    var prices: Set<PriceBucket> = []
    var features: Set<Feature> = []
    var sort: SortOption = .relevance

    var hasActiveFilters: Bool {
        !query.trimmingCharacters(in: .whitespaces).isEmpty
            || category != nil
            || region != nil
            || minAge > 0
            || maxAge < 18
            || !prices.isEmpty
            || !features.isEmpty
    }

    /// Count of active *filters* (excludes free-text search & sort) for the toolbar badge.
    var activeFilterCount: Int {
        var n = 0
        if category != nil { n += 1 }
        if region != nil { n += 1 }
        if minAge > 0 || maxAge < 18 { n += 1 }
        n += prices.count
        n += features.count
        return n
    }

    mutating func reset() { self = FilterState() }
}
