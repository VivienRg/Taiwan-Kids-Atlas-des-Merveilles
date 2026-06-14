import SwiftUI

struct ActivityListView: View {
    @StateObject private var vm = ActivityListViewModel()
    @State private var showFilters = false

    var body: some View {
        NavigationStack {
            content
                .background(Palette.background.ignoresSafeArea())
                .navigationTitle("Kids Atlas")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { toolbarItems }
                .searchable(text: $vm.filter.query, prompt: "Search activities, tags, places")
                .sheet(isPresented: $showFilters) {
                    FilterSheetView(vm: vm)
                }
                .refreshable { await vm.load() }
                .task { await vm.load() }
        }
        .tint(Palette.accent)
    }

    @ViewBuilder
    private var content: some View {
        switch vm.phase {
        case .idle, .loading where vm.totalCount == 0:
            loadingState
        case .error(let message) where vm.totalCount == 0:
            errorState(message)
        default:
            listState
        }
    }

    private var listState: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                resultHeader
                if vm.visible.isEmpty {
                    emptyState
                } else {
                    ForEach(vm.visible) { activity in
                        NavigationLink {
                            ActivityDetailView(activity: activity,
                                               thumbnailURL: vm.thumbnailURL(for: activity))
                        } label: {
                            ActivityCardView(activity: activity,
                                             thumbnailURL: vm.thumbnailURL(for: activity))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
    }

    private var resultHeader: some View {
        HStack {
            Text("\(vm.resultCount) \(vm.resultCount == 1 ? "place" : "places")")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            Spacer()
            if vm.filter.hasActiveFilters {
                Button("Reset") { vm.reset() }
                    .font(.subheadline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No activities match your filters.")
                .foregroundStyle(.secondary)
            Button("Reset all filters") { vm.reset() }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading activities…").foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.largeTitle).foregroundStyle(.secondary)
            Text(message).multilineTextAlignment(.center).foregroundStyle(.secondary).padding(.horizontal)
            Button("Try again") { Task { await vm.load() } }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    @ToolbarContentBuilder
    private var toolbarItems: some ToolbarContent {
        ToolbarItem(placement: .navigationBarTrailing) {
            Menu {
                Picker("Sort", selection: $vm.filter.sort) {
                    ForEach(SortOption.allCases) { Text($0.label).tag($0) }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
            }
        }
        ToolbarItem(placement: .navigationBarTrailing) {
            Button { showFilters = true } label: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "slider.horizontal.3")
                    if vm.filter.activeFilterCount > 0 {
                        Text("\(vm.filter.activeFilterCount)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(4)
                            .background(Palette.accent, in: Circle())
                            .offset(x: 8, y: -8)
                    }
                }
            }
        }
    }
}
