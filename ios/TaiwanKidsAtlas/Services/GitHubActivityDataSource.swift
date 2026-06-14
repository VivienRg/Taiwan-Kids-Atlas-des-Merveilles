import Foundation

/// Phase 1 data source: fetches the static JSON straight from GitHub raw, caching the last
/// good payload for offline use. Decoding is lossy — a single bad record is skipped, not fatal.
struct GitHubActivityDataSource: ActivityDataSource {
    var config: AppConfig = .default
    var session: URLSession = .shared
    private let cache = DiskCache(filename: "activities.json")

    func fetchActivities() async throws -> [Activity] {
        do {
            var request = URLRequest(url: config.activitiesURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                throw DataSourceError.badResponse(http.statusCode)
            }
            let activities = Self.decode(data)
            cache.write(data) // persist last good payload
            return activities
        } catch {
            // Network failed — fall back to cached copy if we have one.
            if let cached = cache.read() {
                return Self.decode(cached)
            }
            throw error
        }
    }

    func thumbnailURL(for activity: Activity) -> URL? {
        config.thumbnailURL(forID: activity.id)
    }

    /// Lossy array decode: skips elements that fail rather than failing the whole feed.
    static func decode(_ data: Data) -> [Activity] {
        let decoder = JSONDecoder()
        if let strict = try? decoder.decode([Activity].self, from: data) { return strict }
        if let lossy = try? decoder.decode([FailableDecodable<Activity>].self, from: data) {
            return lossy.compactMap(\.value)
        }
        return []
    }
}

/// Wrapper that turns a decode failure into `nil` instead of an error.
struct FailableDecodable<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        value = try? container.decode(T.self)
    }
}
