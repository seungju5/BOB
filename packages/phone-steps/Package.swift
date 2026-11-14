// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BapmunnaPhoneSteps",
    platforms: [.iOS(.v15)],
    products: [.library(name: "BapmunnaPhoneSteps", targets: ["PhoneStepsPlugin"])],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.2")
    ],
    targets: [
        .target(
            name: "PhoneStepsPlugin",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")],
            path: "ios/Sources/PhoneStepsPlugin",
            resources: [.process("PrivacyInfo.xcprivacy")],
            linkerSettings: [.linkedFramework("HealthKit")]
        )
    ]
)
