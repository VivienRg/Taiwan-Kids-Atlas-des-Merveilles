import Foundation

/// Single source of truth for where data comes from. Swap `branch`/`owner`/`repo`
/// (or the whole `ActivityDataSource`) to repoint the app — the UI never hard-codes URLs.
struct AppConfig {
    var owner: String = "VivienRg"
    var repo: String = "Taiwan-Kids-Atlas-des-Merveilles"
    var branch: String = "main"

    /// e.g. https://raw.githubusercontent.com/VivienRg/Taiwan-Kids-Atlas-des-Merveilles/main
    var rawBase: URL {
        URL(string: "https://raw.githubusercontent.com/\(owner)/\(repo)/\(branch)")!
    }

    var activitiesURL: URL { rawBase.appendingPathComponent("data/activities.json") }

    func thumbnailURL(forID id: String) -> URL {
        rawBase.appendingPathComponent("thumbnails/\(id).png")
    }

    static let `default` = AppConfig()
}
