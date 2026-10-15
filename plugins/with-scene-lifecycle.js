const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

function adoptScenes(source) {
  if (source.includes("class RivlSceneDelegate:")) return source;
  const start = /#if os\(iOS\) \|\| os\(tvOS\)[\s\S]*?factory\.startReactNative\([\s\S]*?#endif/;
  if (!start.test(source)) throw new Error("RIVL scene migration: unrecognized AppDelegate startup; inspect the native template.");
  source = source.replace("  var window: UIWindow?", "  var window: UIWindow?\n  var sceneLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?");
  source = source.replace(start, "    sceneLaunchOptions = launchOptions");
  return source + `

// One scene owns the window; the app delegate retains Expo's background-task services.
class RivlSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene, let app = appDelegate else { return }
    let window = app.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    self.window = window
    app.window = window
    if window.rootViewController == nil {
      var launchOptions = app.sceneLaunchOptions ?? [:]
      if let context = connectionOptions.urlContexts.first { launchOptions[.url] = context.url }
      if let activity = connectionOptions.userActivities.first {
        launchOptions[.userActivityDictionary] = [
          "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
          "UIApplicationLaunchOptionsUserActivityKey": activity
        ]
      }
      app.reactNativeFactory?.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
      app.sceneLaunchOptions = nil
    }
    window.makeKeyAndVisible()
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }
  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }
  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }
  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
    }
  }
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;
}
const manifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [{
      UISceneConfigurationName: "RIVL",
      UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).RivlSceneDelegate",
    }],
  },
};
module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, c => { c.modResults.UIApplicationSceneManifest = manifest; return c; });
  return withAppDelegate(config, c => { c.modResults.contents = adoptScenes(c.modResults.contents); return c; });
};
module.exports.adoptScenes = adoptScenes;
module.exports.manifest = manifest;
