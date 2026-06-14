import Foundation
import SwiftUI

@MainActor
final class ActivityListViewModel: ObservableObject {
    enum Phase: Equatable {
        case idle, loading, loaded, error(String)
    }

    @Published var filter = FilterState() { didSet { recompute() } }
    @Published private(set) var visible: [Activity] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var availableCategories: [String] = []
    @Published private(set) var availableRegions: [String] = []

    private var all: [Activity] = []
    private let dataSource: ActivityDataSource

    init(dataSource: ActivityDataSource = GitHubActivityDataSource()) {
        self.dataSource = dataSource
    }

    var resultCount: Int { visible.count }
    var totalCount: Int { all.count }

    func load() async {
        if case .loading = phase { return }
        if all.isEmpty { phase = .loading }
        do {
            let items = try await dataSource.fetchActivities()
            all = items
            availableCategories = ActivityFilter.categories(in: items)
            availableRegions = ActivityFilter.regions(in: items)
            recompute()
            phase = .loaded
        } catch {
            phase = all.isEmpty ? .error(error.localizedDescription) : .loaded
        }
    }

    func reset() { filter.reset() } // didSet triggers recompute

    func thumbnailURL(for activity: Activity) -> URL? {
        dataSource.thumbnailURL(for: activity)
    }

    private func recompute() {
        visible = ActivityFilter.apply(all, filter)
    }
}
