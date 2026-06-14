import SwiftUI

/// App color palette (mirrors the web app's warm, light look).
enum Palette {
    static let background = Color(red: 0.988, green: 0.973, blue: 0.953) // #fcf8f3
    static let card = Color.white
    static let accent = Color(red: 0.93, green: 0.46, blue: 0.26)        // warm orange
    static let chipBg = Color(red: 0.96, green: 0.94, blue: 0.90)
}

/// A small pill chip used for tags & meta.
struct Chip: View {
    let text: String
    var systemImage: String? = nil
    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).font(.caption2) }
            Text(text).font(.caption).lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Palette.chipBg, in: Capsule())
        .foregroundStyle(.secondary)
    }
}

/// Category / indoor-outdoor badge overlaid on the image.
struct Badge: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(.ultraThinMaterial, in: Capsule())
            .foregroundStyle(.primary)
    }
}

/// Async image with a name-based placeholder & spinner; relies on URLCache for caching.
struct RemoteImageView: View {
    let url: URL?
    let fallbackText: String

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeIn(duration: 0.25))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            case .empty:
                placeholder.overlay(ProgressView())
            case .failure:
                placeholder
            @unknown default:
                placeholder
            }
        }
    }

    private var placeholder: some View {
        ZStack {
            LinearGradient(colors: [Color(white: 0.2), Color(white: 0.32)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(fallbackText)
                .font(.headline)
                .foregroundStyle(.white.opacity(0.85))
                .multilineTextAlignment(.center)
                .padding()
        }
    }
}
