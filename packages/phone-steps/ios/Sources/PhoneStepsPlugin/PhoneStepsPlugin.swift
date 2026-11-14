import Foundation
import HealthKit
import UIKit
import Capacitor

@objc(PhoneStepsPlugin)
public final class PhoneStepsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoneStepsPlugin"
    public let jsName = "PhoneSteps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readToday", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private lazy var store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private let enabledKey = "bapmunna.healthSteps.enabled"
    private let requestedKey = "bapmunna.healthSteps.authorizationRequested"
    private var generation: UInt64 = 0
    private var authorizationPending = false
    private var queries: [UUID: (HKQuery, CAPPluginCall)] = [:]

    @objc public func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            self.read(call, generation: self.generation)
        }
    }

    @objc public func readToday(_ call: CAPPluginCall) { status(call) }

    @objc public func connect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call), self.available(call) else { return }
            guard !self.authorizationPending else {
                call.reject("A health permission request is already open.", "PERMISSION_REQUEST_PENDING")
                return
            }
            guard let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else {
                call.resolve(self.snapshot("unsupported", reason: "health-data-unavailable"))
                return
            }
            self.generation &+= 1
            self.cancelQueries()
            let requestGeneration = self.generation
            self.defaults.set(true, forKey: self.enabledKey)
            self.authorizationPending = true
            // Empty share types: Bapmunna never writes any HealthKit samples.
            self.store.requestAuthorization(toShare: [], read: [steps]) { completed, error in
                DispatchQueue.main.async {
                    self.authorizationPending = false
                    guard self.current(call, requestGeneration) else { return }
                    guard completed, error == nil else {
                        call.resolve(self.failure(error))
                        return
                    }
                    // This is a completed authorization flow, NOT proof of read permission.
                    self.defaults.set(true, forKey: self.requestedKey)
                    self.read(call, generation: requestGeneration)
                }
            }
        }
    }

    private func read(_ call: CAPPluginCall, generation requestGeneration: UInt64, retry: Int = 0) {
        guard current(call, requestGeneration) else { return }
        guard defaults.bool(forKey: enabledKey) else { call.resolve(snapshot("not-connected")); return }
        guard available(call) else { return }
        guard defaults.bool(forKey: requestedKey) else { call.resolve(snapshot("permission-required")); return }
        guard let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            call.resolve(snapshot("unsupported", reason: "health-data-unavailable")); return
        }
        let end = Date()
        var deviceCalendar = Calendar(identifier: .gregorian)
        deviceCalendar.timeZone = TimeZone.current
        let calendar = deviceCalendar
        let timeZone = calendar.timeZone.identifier
        let start = calendar.startOfDay(for: end)
        let localDate = dateString(end, timeZone: calendar.timeZone)
        // Include overlapping samples and let HealthKit split/merge them into the
        // midnight-anchored day bucket. strictStartDate would drop midnight crossovers.
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let interval = DateComponents(calendar: calendar, timeZone: calendar.timeZone, day: 1)
        let queryID = UUID()
        let query = HKStatisticsCollectionQuery(quantityType: steps, quantitySamplePredicate: predicate,
            options: .cumulativeSum, anchorDate: start, intervalComponents: interval)
        query.initialResultsHandler = { [weak self] _, collection, error in
            DispatchQueue.main.async {
                guard let self, let completed = self.queries.removeValue(forKey: queryID) else { return }
                // This is a foreground snapshot, not a background observer.
                self.store.stop(completed.0)
                guard self.current(call, requestGeneration) else { return }
                guard timeZone == TimeZone.current.identifier,
                      localDate == self.dateString(Date(), timeZone: TimeZone.current) else {
                    if retry == 0 { self.read(call, generation: requestGeneration, retry: 1) }
                    else { call.resolve(self.snapshot("error", reason: "provider-error")) }
                    return
                }
                if let error = error as NSError? {
                    // HealthKit intentionally hides read-denial. Never claim read permission
                    // from authorizationStatus(for:) (it reports WRITE authorization).
                    if error.domain == HKErrorDomain &&
                        (error.code == HKError.Code.errorAuthorizationDenied.rawValue ||
                         error.code == HKError.Code.errorNoData.rawValue) {
                        call.resolve(self.snapshot("no-data", queried: true, day: localDate, zone: timeZone))
                    } else {
                        call.resolve(self.failure(error))
                    }
                    return
                }
                guard let statistics = collection?.statistics(for: start), let quantity = statistics.sumQuantity() else {
                    // Empty may mean no records, denied access, or records not synced yet.
                    call.resolve(self.snapshot("no-data", queried: true, day: localDate, zone: timeZone))
                    return
                }
                guard statistics.startDate == start,
                      statistics.endDate == calendar.date(byAdding: .day, value: 1, to: start) else {
                    call.resolve(self.snapshot("error", reason: "provider-error")); return
                }
                let value = quantity.doubleValue(for: .count())
                guard value.isFinite, value >= 0, value <= 9_007_199_254_740_991 else {
                    call.resolve(self.snapshot("error", reason: "provider-error")); return
                }
                // HealthKit returns Double statistics; display whole steps as in
                // Apple's daily-step example, including boundary-apportioned samples.
                call.resolve(self.snapshot("ready", count: Int64(value), queried: true, day: localDate, zone: timeZone))
            }
        }
        queries[queryID] = (query, call)
        store.execute(query)
    }

    @objc public func disconnect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call) else { return }
            self.generation &+= 1
            self.defaults.removeObject(forKey: self.enabledKey)
            self.defaults.removeObject(forKey: self.requestedKey)
            self.cancelQueries()
            // Apple's authorization and health store remain under the user's control.
            call.resolve(self.snapshot("not-connected"))
        }
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.trusted(call), let url = URL(string: UIApplication.openSettingsURLString) else { return }
            // Public app-settings URL; the web UI also explains Health > Sharing > Apps.
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("설정을 열 수 없어요.", "SETTINGS_UNAVAILABLE") }
            }
        }
    }

    private func cancelQueries() {
        let pending = Array(queries.values)
        queries.removeAll()
        for (query, call) in pending {
            store.stop(query)
            call.reject("The health steps request was superseded.", "STALE_REQUEST")
        }
    }

    private func current(_ call: CAPPluginCall, _ requestGeneration: UInt64) -> Bool {
        guard generation == requestGeneration else {
            call.reject("The health steps request was superseded.", "STALE_REQUEST")
            return false
        }
        return true
    }

    private func trusted(_ call: CAPPluginCall) -> Bool {
        if let url = bridge?.webView?.url, url.scheme == "capacitor", url.host == "localhost", url.port == nil { return true }
        call.reject("Health steps is available only in the packaged app.", "UNTRUSTED_ORIGIN")
        return false
    }

    private func available(_ call: CAPPluginCall) -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(snapshot("unsupported", reason: "health-data-unavailable")); return false
        }
        return true
    }

    private func failure(_ error: Error?) -> JSObject {
        if let value = error as NSError?, value.domain == HKErrorDomain {
            if value.code == HKError.Code.errorHealthDataUnavailable.rawValue {
                return snapshot("unsupported", reason: "health-data-unavailable")
            }
            if value.code == HKError.Code.errorHealthDataRestricted.rawValue {
                return snapshot("unsupported", reason: "permission-restricted")
            }
        }
        return snapshot("error", reason: "provider-error")
    }

    private func dateString(_ date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func snapshot(_ status: String, count: Int64? = nil, queried: Bool = false, reason: String? = nil, day: String? = nil, zone: String? = nil) -> JSObject {
        let now = Date()
        let serializedCount: Any = count.map { NSNumber(value: $0) as Any } ?? NSNull()
        let updatedAt: Any = queried ? ISO8601DateFormatter().string(from: now) as Any : NSNull()
        var result: JSObject = [
            "schemaVersion": 1,
            "status": status,
            "count": serializedCount,
            "localDate": day ?? dateString(now, timeZone: TimeZone.current),
            "timeZone": zone ?? TimeZone.current.identifier,
            "updatedAt": updatedAt,
            "source": "ios-healthkit",
            "partialDay": false,
            "trackingSince": NSNull()
        ]
        if let reason { result["reason"] = reason }
        return result
    }
}
