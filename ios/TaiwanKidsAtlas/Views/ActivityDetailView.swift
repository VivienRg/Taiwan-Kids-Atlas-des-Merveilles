import SwiftUI

struct ActivityDetailView: View {
    let activity: Activity
    let thumbnailURL: URL?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                RemoteImageView(url: thumbnailURL, fallbackText: activity.name)
                    .frame(height: 240)
                    .frame(maxWidth: .infinity)
                    .clipped()

                VStack(alignment: .leading, spacing: 16) {
                    header
                    actions
                    if !activity.desc.isEmpty { section("About", activity.desc) }
                    metaGrid
                    if !activity.tags.isEmpty { tagsSection }
                    if !activity.addressEn.isEmpty { section("Address", activity.addressEn) }
                }
                .padding(16)
            }
        }
        .background(Palette.background.ignoresSafeArea())
        .navigationTitle(activity.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(activity.name).font(.title2.bold())
            if !activity.locationLine.isEmpty {
                Label(activity.locationLine, systemImage: "mappin.and.ellipse")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            FlowLayout(spacing: 6) {
                ForEach(activity.categories, id: \.self) { Chip(text: $0) }
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 12) {
            Button {
                if let url = MapLauncher.mapURL(for: activity) { openURL(url) }
            } label: {
                Label("View on Map", systemImage: "map")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            if let site = MapLauncher.websiteURL(for: activity) {
                Button { openURL(site) } label: {
                    Label("Website", systemImage: "safari").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var metaGrid: some View {
        FlowLayout(spacing: 8) {
            if activity.ageRange != nil {
                Chip(text: "Ages \(activity.ageMin)–\(activity.ageMax)", systemImage: "figure.child")
            }
            if !activity.costRange.isEmpty {
                Chip(text: activity.costRange == "0" ? "Free" : "NT$\(activity.costRange)",
                     systemImage: "dollarsign.circle")
            }
            if let drive = activity.driveMin {
                Chip(text: "\(drive) min drive", systemImage: "car")
            }
            if !activity.indoorOutdoor.isEmpty {
                Chip(text: activity.indoorOutdoor, systemImage: "building.2")
            }
            if activity.natural {
                Chip(text: "Natural", systemImage: "leaf")
            }
        }
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tags").font(.headline)
            FlowLayout(spacing: 6) {
                ForEach(activity.tags, id: \.self) { Chip(text: "#\($0)") }
            }
        }
    }

    private func section(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            Text(body).font(.body).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
