import UIKit
import Capacitor

enum HealthLaunchLink {
    static let localURL = URL(string: "capacitor://localhost/health/")!
    static func accepts(_ value: String) -> Bool {
        return value == "bapmunna://health"
            || value == "bapmunna://health/"
            || value == "https://impact-series.web.app/bapmunna/app/health"
            || value == "https://impact-series.web.app/bapmunna/app/health/"
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        // Cold launch always uses the bundled /health/ route. Never forward an
        // external URL, userActivity metadata, account or token into the bridge.
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts where HealthLaunchLink.accepts(context.url.absoluteString) {
            openHealth()
            break
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL,
              HealthLaunchLink.accepts(url.absoluteString) else { return }
        openHealth()
    }

    private func openHealth() {
        guard let controller = window?.rootViewController as? CAPBridgeViewController,
              controller.webView?.url != HealthLaunchLink.localURL else { return }
        controller.webView?.load(URLRequest(url: HealthLaunchLink.localURL))
    }
}
