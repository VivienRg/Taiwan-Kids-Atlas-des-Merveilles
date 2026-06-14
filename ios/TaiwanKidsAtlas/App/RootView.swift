import SwiftUI

/// Shows a brief branded splash, then the main browse screen. The list begins loading
/// immediately underneath, so the splash never blocks real work.
struct RootView: View {
    @State private var showSplash = true

    var body: some View {
        ZStack {
            ActivityListView()
            if showSplash {
                SplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            withAnimation(.easeOut(duration: 0.4)) { showSplash = false }
        }
    }
}

struct SplashView: View {
    @State private var appeared = false

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "map.circle.fill")
                    .resizable().scaledToFit()
                    .frame(width: 96, height: 96)
                    .foregroundStyle(Palette.accent)
                VStack(spacing: 4) {
                    Text("Taiwan").font(.title.bold())
                    Text("Kids Atlas des Merveilles")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .opacity(appeared ? 1 : 0)
            .scaleEffect(appeared ? 1 : 0.92)
        }
        .onAppear {
            withAnimation(.easeIn(duration: 0.6)) { appeared = true }
        }
    }
}
