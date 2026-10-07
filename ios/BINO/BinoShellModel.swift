import AuthenticationServices
import UIKit
import WebKit

@MainActor
final class BinoShellModel: NSObject, ObservableObject {
    @Published var isLoading = true
    @Published var progress: Double = 0
    @Published var showOffline = false

    weak var webView: WKWebView?
    private var authSession: ASWebAuthenticationSession?
    private let oauthPresenter = OAuthPresenter()
    private var consumedAuthCodes = Set<String>()

    func attach(_ webView: WKWebView) {
        self.webView = webView
        oauthPresenter.anchorView = webView
    }

    func load(_ url: URL) {
        showOffline = false
        isLoading = true
        webView?.load(URLRequest(url: url))
    }

    func reload() {
        showOffline = false
        if webView?.url == nil {
            load(AppConfig.homeURL)
        } else {
            webView?.reload()
        }
    }

    func noteProgress(_ value: Double) {
        progress = value
        if value < 1 {
            isLoading = true
        }
    }

    func noteFinished() {
        isLoading = false
        progress = 1
        showOffline = false
    }

    func noteFailed(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        isLoading = false
        if webView?.url == nil {
            showOffline = true
        }
    }

    func handleScriptMessage(_ body: Any) {
        guard let payload = body as? [String: Any],
              payload["type"] as? String == "oauth",
              let urlString = payload["url"] as? String,
              let url = URL(string: urlString) else { return }
        beginOAuth(url: url)
    }

    func beginOAuth(url: URL) {
        guard AppConfig.isAllowedOAuthStart(url) else { return }
        authSession?.cancel()
        let callback: ASWebAuthenticationSession.Callback = AppConfig.authorizeURLUsesNativeScheme(url)
            ? .customScheme(AppConfig.nativeScheme)
            : .https(host: AppConfig.authCallbackHost, path: AppConfig.authCallbackPath)
        let session = ASWebAuthenticationSession(url: url, callback: callback) { [weak self] callbackURL, error in
            Task { @MainActor in
                guard let self else { return }
                self.authSession = nil
                if let callbackURL {
                    self.handleOpenURL(callbackURL)
                    return
                }
                if Self.isCancellation(error) {
                    self.load(AppConfig.loginURL)
                }
            }
        }
        session.presentationContextProvider = oauthPresenter
        session.prefersEphemeralWebBrowserSession = false
        oauthPresenter.anchorView = webView
        authSession = session
        if !session.start() {
            authSession = nil
            load(url)
        }
    }

    func handleOpenURL(_ url: URL) {
        if url.scheme?.lowercased() == AppConfig.nativeScheme {
            guard let https = AppConfig.httpsCallback(fromNative: url) else { return }
            loadCallbackOnce(https)
            return
        }
        if url.scheme?.lowercased() == "https",
           url.host?.lowercased() == AppConfig.authCallbackHost,
           url.path == AppConfig.authCallbackPath {
            loadCallbackOnce(url)
        }
    }

    private func loadCallbackOnce(_ url: URL) {
        if let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "code" })?
            .value {
            if consumedAuthCodes.contains(code) { return }
            consumedAuthCodes.insert(code)
        }
        load(url)
    }

    private static func isCancellation(_ error: Error?) -> Bool {
        let nsError = error as NSError?
        return nsError?.domain == ASWebAuthenticationSessionErrorDomain
            && nsError?.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
    }
}

final class OAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    weak var anchorView: UIView?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = anchorView?.window {
            return window
        }
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        return scene?.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
