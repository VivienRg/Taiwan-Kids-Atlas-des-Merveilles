import Foundation

/// Builds URLs for opening maps & websites. Honours the activity's `map_link` first,
/// falling back to an Apple Maps query (which itself falls back to Google in `openMap`).
enum MapLauncher {

    static func mapURL(for activity: Activity) -> URL? {
        if let link = activity.mapLink, let url = URL(string: link) { return url }
        return appleMapsURL(query: activity.mapsQuery)
    }

    static func appleMapsURL(query: String) -> URL? {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "http://maps.apple.com/?q=\(encoded)")
    }

    static func googleMapsURL(query: String) -> URL? {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://www.google.com/maps?q=\(encoded)")
    }

    static func websiteURL(for activity: Activity) -> URL? {
        guard let site = activity.website, !site.isEmpty else { return nil }
        return URL(string: site)
    }
}
