import SwiftUI

@main
struct TaiwanKidsAtlasApp: App {
    init() {
        // Generous URL cache so thumbnails & JSON are served from disk when offline.
        let cache = URLCache(memoryCapacity: 16 * 1024 * 1024,
                             diskCapacity: 256 * 1024 * 1024)
        URLCache.shared = cache
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
