import Foundation

/// The seam between the UI and wherever data lives. Phase 1 is `GitHubActivityDataSource`
/// (read-only static files). Phase 2 (REST API + auth) implements the same protocol, so
/// views and the view model never change.
protocol ActivityDataSource {
    func fetchActivities() async throws -> [Activity]
    func thumbnailURL(for activity: Activity) -> URL?
}

enum DataSourceError: LocalizedError {
    case badResponse(Int)
    case offlineNoCache

    var errorDescription: String? {
        switch self {
        case .badResponse(let code): return "Server returned an error (\(code))."
        case .offlineNoCache: return "You're offline and there's no saved data yet."
        }
    }
}
