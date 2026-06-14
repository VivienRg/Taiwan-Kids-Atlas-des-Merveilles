import SwiftUI

struct ActivityCardView: View {
    let activity: Activity
    let thumbnailURL: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            imageHeader
            content
        }
        .background(Palette.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 3)
    }

    private var imageHeader: some View {
        RemoteImageView(url: thumbnailURL, fallbackText: activity.name)
            .frame(height: 168)
            .frame(maxWidth: .infinity)
            .clipped()
            .overlay(alignment: .topLeading) {
                Badge(text: activity.primaryCategory).padding(10)
            }
            .overlay(alignment: .topTrailing) {
                if !activity.indoorOutdoor.isEmpty {
                    Badge(text: activity.indoorOutdoor).padding(10)
                }
            }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(activity.name)
                .font(.headline)
                .lineLimit(2)

            if !activity.locationLine.isEmpty {
                Label(activity.locationLine, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                if activity.ageRange != nil {
                    Chip(text: "Ages \(activity.ageMin)–\(activity.ageMax)", systemImage: "figure.child")
                }
                if !activity.costRange.isEmpty {
                    Chip(text: priceText, systemImage: "dollarsign.circle")
                }
                if let drive = activity.driveMin {
                    Chip(text: "\(drive) min", systemImage: "car")
                }
            }

            if !activity.desc.isEmpty {
                Text(activity.desc)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if !activity.tags.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(activity.tags.prefix(4), id: \.self) { Chip(text: "#\($0)") }
                    if activity.tags.count > 4 {
                        Chip(text: "+\(activity.tags.count - 4)")
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var priceText: String {
        activity.costRange == "0" ? "Free" : "NT$\(activity.costRange)"
    }
}
