import SwiftUI

struct FilterSheetView: View {
    @ObservedObject var vm: ActivityListViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                categorySection
                ageSection
                priceSection
                featureSection
                sortSection
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Reset") { vm.reset() }
                        .disabled(!vm.filter.hasActiveFilters)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }.bold()
                }
            }
        }
        .tint(Palette.accent)
        .presentationDetents([.medium, .large])
    }

    private var categorySection: some View {
        Section("Category & Region") {
            Picker("Category", selection: categoryBinding) {
                Text("All").tag(String?.none)
                ForEach(vm.availableCategories, id: \.self) { Text($0).tag(String?.some($0)) }
            }
            Picker("Region", selection: regionBinding) {
                Text("All").tag(String?.none)
                ForEach(vm.availableRegions, id: \.self) { Text($0).tag(String?.some($0)) }
            }
        }
    }

    private var ageSection: some View {
        Section("Age range") {
            Stepper("Min age: \(vm.filter.minAge)", value: $vm.filter.minAge, in: 0...vm.filter.maxAge)
            Stepper("Max age: \(vm.filter.maxAge)", value: $vm.filter.maxAge, in: vm.filter.minAge...18)
        }
    }

    private var priceSection: some View {
        Section("Price") {
            ForEach(PriceBucket.allCases) { bucket in
                Toggle(bucket.label, isOn: toggleBinding(for: bucket))
            }
        }
    }

    private var featureSection: some View {
        Section("Features") {
            ForEach(Feature.allCases) { feature in
                Toggle(isOn: featureBinding(for: feature)) {
                    Label(feature.label, systemImage: feature.systemImage)
                }
            }
        }
    }

    private var sortSection: some View {
        Section("Sort by") {
            Picker("Sort", selection: $vm.filter.sort) {
                ForEach(SortOption.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.menu)
        }
    }

    // MARK: Bindings

    private var categoryBinding: Binding<String?> {
        Binding(get: { vm.filter.category }, set: { vm.filter.category = $0 })
    }
    private var regionBinding: Binding<String?> {
        Binding(get: { vm.filter.region }, set: { vm.filter.region = $0 })
    }
    private func toggleBinding(for bucket: PriceBucket) -> Binding<Bool> {
        Binding(
            get: { vm.filter.prices.contains(bucket) },
            set: { on in if on { vm.filter.prices.insert(bucket) } else { vm.filter.prices.remove(bucket) } }
        )
    }
    private func featureBinding(for feature: Feature) -> Binding<Bool> {
        Binding(
            get: { vm.filter.features.contains(feature) },
            set: { on in if on { vm.filter.features.insert(feature) } else { vm.filter.features.remove(feature) } }
        )
    }
}
