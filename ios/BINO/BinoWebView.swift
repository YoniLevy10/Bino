import SwiftUI
import WebKit

struct BinoWebRepresentable: UIViewRepresentable {
    @ObservedObject var model: BinoShellModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let script = WKUserScript(
            source: "window.BinoNative={platform:'ios',version:'1.0'};",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(script)
        configuration.userContentController.add(context.coordinator, name: "bino")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = true
        let background = UIColor(red: 249 / 255, green: 249 / 255, blue: 251 / 255, alpha: 1)
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        #if DEBUG
        webView.isInspectable = true
        #endif

        let refresh = UIRefreshControl()
        refresh.tintColor = UIColor(red: 0, green: 122 / 255, blue: 1, alpha: 1)
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh), for: .valueChanged)
        webView.scrollView.addSubview(refresh)
        context.coordinator.refreshControl = refresh

        webView.addObserver(context.coordinator, forKeyPath: "estimatedProgress", options: .new, context: nil)
        context.coordinator.observedWebView = webView
        model.attach(webView)

        webView.evaluateJavaScript("navigator.userAgent") { result, _ in
            let base = (result as? String) ?? ""
            if !base.contains("BinoIOS") {
                webView.customUserAgent = base + " " + AppConfig.userAgentToken
            }
            webView.load(URLRequest(url: AppConfig.homeURL))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        if coordinator.observedWebView === uiView {
            uiView.removeObserver(coordinator, forKeyPath: "estimatedProgress")
            coordinator.observedWebView = nil
        }
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "bino")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let model: BinoShellModel
        var refreshControl: UIRefreshControl?
        weak var observedWebView: WKWebView?

        init(model: BinoShellModel) {
            self.model = model
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let body = message.body
            Task { @MainActor in
                self.model.handleScriptMessage(body)
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let mainFrame = navigationAction.targetFrame?.isMainFrame ?? (navigationAction.targetFrame == nil)
            apply(AppConfig.decide(url: url, mainFrame: mainFrame), url: url, webView: webView, decisionHandler: decisionHandler)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                apply(AppConfig.decide(url: url, mainFrame: true), url: url, webView: webView) { _ in }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            Task { @MainActor in
                self.model.isLoading = true
                self.model.showOffline = false
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            refreshControl?.endRefreshing()
            Task { @MainActor in
                self.model.noteFinished()
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            refreshControl?.endRefreshing()
            Task { @MainActor in
                self.model.noteFailed(error)
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            refreshControl?.endRefreshing()
            Task { @MainActor in
                self.model.noteFailed(error)
            }
        }

        override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
            guard keyPath == "estimatedProgress", let webView = object as? WKWebView else { return }
            let value = webView.estimatedProgress
            Task { @MainActor in
                self.model.noteProgress(value)
            }
        }

        @objc func refresh() {
            Task { @MainActor in
                self.model.reload()
            }
        }

        private func apply(
            _ decision: AppConfig.NavigationDecision,
            url: URL,
            webView: WKWebView,
            decisionHandler: ((WKNavigationActionPolicy) -> Void)?
        ) {
            switch decision {
            case .allow:
                if decisionHandler == nil {
                    webView.load(URLRequest(url: url))
                }
                decisionHandler?(.allow)
            case .openExternally:
                decisionHandler?(.cancel)
                UIApplication.shared.open(url)
            case .startOAuth:
                decisionHandler?(.cancel)
                Task { @MainActor in
                    self.model.beginOAuth(url: url)
                }
            case .deliverToApp:
                decisionHandler?(.cancel)
                Task { @MainActor in
                    self.model.handleOpenURL(url)
                }
            }
        }
    }
}
