import SwiftUI

@main
struct BINOApp: App {
    var body: some Scene {
        WindowGroup {
            BinoRootView()
        }
    }
}

struct BinoRootView: View {
    @StateObject private var model = BinoShellModel()

    var body: some View {
        ZStack(alignment: .top) {
            BinoWebRepresentable(model: model)
                .background(BinoColor.background)

            if model.isLoading {
                ProgressView(value: model.progress)
                    .progressViewStyle(.linear)
                    .tint(BinoColor.blue)
                    .frame(height: 3)
            }

            if model.showOffline {
                offlineOverlay
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .onOpenURL { model.handleOpenURL($0) }
    }

    private var offlineOverlay: some View {
        VStack(spacing: 16) {
            Text("אין חיבור ל-BINO")
                .font(.title2.weight(.semibold))
            Text("בדקו את הרשת ונסו שוב.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("נסו שוב") {
                model.load(AppConfig.homeURL)
            }
            .buttonStyle(.borderedProminent)
            .tint(BinoColor.blue)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BinoColor.background)
    }
}

enum BinoColor {
    static let background = Color(red: 249 / 255, green: 249 / 255, blue: 251 / 255)
    static let blue = Color(red: 0, green: 122 / 255, blue: 1)
}
