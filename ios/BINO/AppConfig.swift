import Foundation

enum AppConfig {
    static let bundleID = "casa.bino.app"
    static let nativeScheme = "bino"
    static let userAgentToken = "BinoIOS/1.0"
    static let authCallbackHost = "bino.casa"
    static let authCallbackPath = "/auth/callback"

    static let homeURL = URL(string: "https://bino.casa/")!
    static let loginURL = URL(string: "https://bino.casa/login")!

    enum NavigationDecision {
        case allow
        case openExternally
        case startOAuth
        case deliverToApp
    }

    static func decide(url: URL, mainFrame: Bool) -> NavigationDecision {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "about" || scheme == "blob" || scheme == "data" {
            return .allow
        }
        if scheme == nativeScheme {
            return .deliverToApp
        }
        if ["tel", "mailto", "sms", "whatsapp"].contains(scheme) {
            return .openExternally
        }
        if scheme != "http" && scheme != "https" {
            return mainFrame ? .openExternally : .allow
        }
        if !mainFrame {
            return .allow
        }
        if isOAuthNavigation(url) {
            return .startOAuth
        }
        if let host = url.host?.lowercased(), isFirstPartyHost(host) {
            return .allow
        }
        return .openExternally
    }

    static func isOAuthNavigation(_ url: URL) -> Bool {
        guard isAllowedOAuthStart(url) else { return false }
        let host = url.host?.lowercased() ?? ""
        if host == "accounts.google.com" { return true }
        return url.path.contains("/auth/v1/authorize")
    }

    static func isAllowedOAuthStart(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else { return false }
        if host == "accounts.google.com" { return true }
        return host == "supabase.co" || host.hasSuffix(".supabase.co")
    }

    static func isFirstPartyHost(_ host: String) -> Bool {
        let value = host.lowercased()
        if value == "bino.casa" || value == "www.bino.casa" { return true }
        return value == "supabase.co" || value.hasSuffix(".supabase.co")
    }

    static func authorizeURLUsesNativeScheme(_ url: URL) -> Bool {
        guard let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return false }
        for item in items where item.name == "redirect_to" || item.name == "redirect_uri" {
            let value = item.value ?? ""
            if value.hasPrefix("\(nativeScheme)://") { return true }
        }
        return false
    }

    /// `bino://auth/callback?code=&next=` → `https://bino.casa/auth/callback?...`
    static func httpsCallback(fromNative url: URL) -> URL? {
        guard url.scheme?.lowercased() == nativeScheme else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = authCallbackHost
        let host = url.host ?? ""
        let path = url.path
        if host == "auth" {
            components.path = "/auth" + path
        } else if path.isEmpty {
            components.path = authCallbackPath
        } else {
            components.path = path.hasPrefix("/") ? path : "/" + path
        }
        components.percentEncodedQuery = url.query
        guard let resolved = components.url, resolved.host == authCallbackHost else { return nil }
        if resolved.path != authCallbackPath && !resolved.path.hasPrefix(authCallbackPath + "/") {
            return nil
        }
        return resolved
    }
}
