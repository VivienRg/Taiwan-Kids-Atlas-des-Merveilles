import Foundation

/// Tiny on-disk cache for the last successful payload, so the app is usable offline.
struct DiskCache {
    let filename: String

    private var url: URL {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent(filename)
    }

    func write(_ data: Data) {
        try? data.write(to: url, options: .atomic)
    }

    func read() -> Data? {
        try? Data(contentsOf: url)
    }
}
