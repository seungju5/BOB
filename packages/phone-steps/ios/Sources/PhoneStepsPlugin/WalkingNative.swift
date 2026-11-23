import Foundation
import HealthKit
import Security
import Capacitor
import UIKit

private struct WalkingDevice: Codable {
    let token: String
    let nickname: String
    let publicId: String
    let sharingScope: String?
    var scope: String { sharingScope ?? "public" }
    var expiresAt: String
    var confirmed: Bool
    var revokePending: Bool
}

private final class WalkingNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/** Native-only bearer storage and fixed-origin transport; never returns the token. */
@MainActor final class WalkingNative {
    private let service = "com.warmingup.walking.device.v1"
    // Enable only when this team's authenticated API is available on its Hosting site.
    private let walkingSharingEnabled = false
    private let healthEnabled: () -> Bool
    private let healthRevision: () -> UInt64
    private let store = HKHealthStore()
    private var revision: UInt64 = 0
    private var busy = false
    private var reading = false
    private let network: URLSession
    init(healthEnabled: @escaping () -> Bool, healthRevision: @escaping () -> UInt64) {
        self.healthEnabled = healthEnabled; self.healthRevision = healthRevision
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false; config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData; config.timeoutIntervalForRequest = 15
        network = URLSession(configuration: config, delegate: WalkingNoRedirect(), delegateQueue: nil)
    }
    private var query: [String: Any] { [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:service, kSecAttrAccount as String:"device"] }
    private func save(_ value: WalkingDevice?) throws {
        if let value {
            let bytes = try JSONEncoder().encode(value)
            let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String:bytes] as CFDictionary)
            if status == errSecItemNotFound {
                var item = query; item[kSecValueData as String] = bytes
                item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw WalkingNativeError(code:"secure_storage") }
            } else if status != errSecSuccess { throw WalkingNativeError(code:"secure_storage") }
        } else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw WalkingNativeError(code:"secure_storage") }
        }
    }
    private func load() throws -> WalkingDevice? {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = try? JSONDecoder().decode(WalkingDevice.self, from:data),
              ["private", "public"].contains(value.scope),
              value.token.range(of:"^walk_[A-Za-z0-9_-]{43}$", options:.regularExpression) != nil,
              let expiry = parseISO(value.expiresAt) else { throw WalkingNativeError(code:"secure_storage") }
        if expiry <= Date() && !value.revokePending { try save(nil); return nil }
        return value
    }
    private func visible(_ value: WalkingDevice?) -> JSObject {
        guard let value else { return ["linked":false,"confirmed":false,"revokePending":false] }
        return ["linked":!value.revokePending,"confirmed":value.confirmed && !value.revokePending,
                "revokePending":value.revokePending,"nickname":value.nickname,"publicId":value.publicId,"expiresAt":value.expiresAt,"sharingScope":value.scope]
    }
    func status() throws -> JSObject { visible(try load()) }
    func link(code: String) async throws -> JSObject {
        guard !busy else { throw WalkingNativeError(code:"request_busy") }
        guard code.range(of:"^[0-9]{8}$",options:.regularExpression) != nil else { throw WalkingNativeError(code:"invalid_code") }
        guard try load() == nil else { throw WalkingNativeError(code:"disconnect_first") }
        busy = true; defer { busy = false }; revision &+= 1; let expected = revision
        let response = try await request("pair", body:["code":code])
        guard let token = response["token"] as? String, token.range(of:"^walk_[A-Za-z0-9_-]{43}$",options:.regularExpression) != nil,
              let nickname = response["nickname"] as? String, !nickname.isEmpty, let publicId = response["publicId"] as? String, !publicId.isEmpty,
              let expiresAt = response["expiresAt"] as? String, let expiry = parseISO(expiresAt), expiry > Date(), response["confirmed"] as? Bool == false else { throw WalkingNativeError(code:"invalid_response") }
        guard expected == revision else { _ = try? await request("unpair",body:[:],token:token); throw WalkingNativeError(code:"stale_request") }
        let scope = try WalkingPayload.sharingScope(response["sharingScope"])
        let saved = WalkingDevice(token:token,nickname:nickname,publicId:publicId,sharingScope:scope,expiresAt:expiresAt,confirmed:false,revokePending:false)
        do { try save(saved) } catch { _ = try? await request("unpair",body:[:],token:token); throw error }
        return visible(saved)
    }
    func confirm(consentVersion: String, share: Bool, shareRanking: JSValue?) async throws -> JSObject {
        guard !busy else { throw WalkingNativeError(code:"request_busy") }
        busy = true; defer { busy = false }; let expected = revision
        var saved = try requireDevice(confirmed:false)
        let body = try WalkingPayload.confirmationBody(scope:saved.scope,version:consentVersion,share:share,shareRanking:shareRanking)
        let response = try await authenticated("confirm",body:body,device:saved)
        guard expected == revision else { throw WalkingNativeError(code:"stale_request") }
        guard try WalkingPayload.sharingScope(response["sharingScope"]) == saved.scope else { throw WalkingNativeError(code:"invalid_response") }
        guard response["ok"] as? Bool == true, response["confirmed"] as? Bool == true,
              response["nickname"] as? String == saved.nickname, response["publicId"] as? String == saved.publicId,
              let expires = response["expiresAt"] as? String, let expiry = parseISO(expires), expiry > Date() else { throw WalkingNativeError(code:"invalid_response") }
        saved.confirmed = true; saved.expiresAt = expires; try save(saved); revision &+= 1
        return visible(saved)
    }
    private func requireDevice(confirmed: Bool = true) throws -> WalkingDevice {
        guard let value = try load() else { throw WalkingNativeError(code:"device_expired") }
        guard !value.revokePending else { throw WalkingNativeError(code:"revocation_pending") }
        guard !confirmed || value.confirmed else { throw WalkingNativeError(code:"device_confirmation_required") }
        return value
    }
    func disconnect() async throws {
        revision &+= 1 // Barrier is set before any request can submit another snapshot.
        guard var saved = try load() else { return }
        saved.revokePending = true; try save(saved)
        do {
            let response = try await request("unpair",body:[:],token:saved.token)
            guard response["ok"] as? Bool == true else { throw WalkingNativeError(code:"invalid_response") }
            if try load()?.token == saved.token { try save(nil) }
        }
        catch let failure as WalkingNativeError { if failure.status == 401 { try save(nil) } else { throw failure } }
    }
    func sync() async throws -> JSObject {
        guard !busy else { throw WalkingNativeError(code:"request_busy") }
        busy = true; defer { busy = false }
        if try load()?.revokePending == true { try await disconnect(); return ["ok":false,"reason":"not-linked"] }
        let device = try requireDevice(), expected = revision, healthExpected = healthRevision()
        let snapshot = try await readToday()
        guard try requireDevice().token == device.token else { throw WalkingNativeError(code:"stale_request") }
        let status = snapshot["status"] as? String ?? "no-data"
        switch WalkingPayload.afterRead(status:status,sameRevision:revision == expected && healthRevision() == healthExpected,consent:healthEnabled(),foreground:UIApplication.shared.applicationState == .active) {
        case .stale: throw WalkingNativeError(code:"stale_request")
        case .skip: return ["ok":false,"reason":status]
        case .upload: break
        }
        guard let count = snapshot["count"] as? NSNumber else { throw WalkingNativeError(code:"invalid_response") }
        let body: JSObject = ["date":snapshot["localDate"]!,"count":count,"source":"ios-healthkit","queriedAt":snapshot["queriedAt"]!,"timeZone":"Asia/Seoul"]
        let response = try await authenticated("sync",body:body,device:device)
        guard expected == revision else { throw WalkingNativeError(code:"stale_request") }
        guard response["ok"] as? Bool == true, let date = response["date"] as? String, date == (body["date"] as? String),
              let uploaded = WalkingPayload.integer(response["count"]), uploaded == count.intValue, let synced = response["syncedAt"] as? String, parseISO(synced) != nil else { throw WalkingNativeError(code:"invalid_response") }
        return ["ok":true,"date":date,"count":uploaded,"syncedAt":synced]
    }
    func board() async throws -> JSObject {
        guard !busy else { throw WalkingNativeError(code:"request_busy") }
        busy = true; defer { busy = false }; let expected = revision
        let device = try requireDevice()
        let response = try await authenticated("board",body:nil,device:device)
        guard expected == revision, try requireDevice().token == device.token else { throw WalkingNativeError(code:"stale_request") }
        return try WalkingPayload.cleanBoard(response, now: Date(), sharingScope:device.scope)
    }
    func hearts(action: String, body: JSObject?) async throws -> JSObject {
        try HeartsPayload.validate(action:action,body:body)
        guard !busy else { throw WalkingNativeError(code:"request_busy") }
        busy = true; defer { busy = false }; let expected = revision
        let device = try requireDevice()
        let response = try await authenticated(action,body:body,device:device)
        guard expected == revision, try requireDevice().token == device.token else { throw WalkingNativeError(code:"stale_request") }
        return try HeartsPayload.clean(action:action,value:response)
    }
    func readToday() async throws -> JSObject {
        guard !reading else { throw WalkingNativeError(code:"request_busy") }
        reading = true; defer { reading = false }
        let expected = healthRevision(), started = Date(), zone = TimeZone(identifier:"Asia/Seoul")!
        let date = day(started)
        var base: JSObject = ["schemaVersion":1,"status":"no-data","count":NSNull(),"localDate":date,"timeZone":"Asia/Seoul",
                              "updatedAt":NSNull(),"source":"ios-healthkit","partialDay":false,"trackingSince":NSNull(),"queriedAt":iso(started)]
        guard healthEnabled() else { base["status"] = "not-connected"; return base }
        guard UIApplication.shared.applicationState == .active else { throw WalkingNativeError(code:"app_backgrounded") }
        guard HKHealthStore.isHealthDataAvailable(), let quantity = HKObjectType.quantityType(forIdentifier:.stepCount) else { base["status"] = "unsupported"; return base }
        var calendar = Calendar(identifier:.gregorian); calendar.timeZone = zone
        let start = calendar.startOfDay(for:started)
        let end = calendar.date(byAdding:.day,value:1,to:start)!
        let healthStore = store
        let result: Double? = try await withCheckedThrowingContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart:start,end:started,options:[])
            let interval = DateComponents(calendar:calendar,timeZone:zone,day:1)
            let query = HKStatisticsCollectionQuery(quantityType:quantity,quantitySamplePredicate:predicate,options:.cumulativeSum,anchorDate:start,intervalComponents:interval)
            query.initialResultsHandler = { query, values, error in
                healthStore.stop(query)
                if let error = error as NSError? {
                    if error.domain == HKErrorDomain && (error.code == HKError.Code.errorAuthorizationDenied.rawValue || error.code == HKError.Code.errorNoData.rawValue) { continuation.resume(returning:nil) }
                    else { continuation.resume(throwing:WalkingNativeError(code:"health_unavailable")) }
                } else if let statistics = values?.statistics(for:start) {
                    guard statistics.startDate == start, statistics.endDate == end else { continuation.resume(throwing:WalkingNativeError(code:"health_unavailable")); return }
                    continuation.resume(returning:statistics.sumQuantity()?.doubleValue(for:.count()))
                } else { continuation.resume(returning:nil) }
            }
            store.execute(query)
        }
        guard healthEnabled(), healthRevision() == expected, day(Date()) == date, UIApplication.shared.applicationState == .active else { throw WalkingNativeError(code:"stale_request") }
        base["updatedAt"] = iso(Date())
        if let result {
            guard result.isFinite, result >= 0, result <= 9_007_199_254_740_991 else { throw WalkingNativeError(code:"health_unavailable") }
            base["status"] = "ready"; base["count"] = NSNumber(value:Int64(result))
        }
        return base
    }
    private func authenticated(_ path: String, body: JSObject?, device: WalkingDevice) async throws -> JSObject {
        do { return try await request(path,body:body,token:device.token) }
        catch let failure as WalkingNativeError {
            if failure.status == 401 || (failure.status == 403 && failure.code != "device_confirmation_required" && !HeartsPayload.nonRevokingErrors.contains(failure.code)), try load()?.token == device.token { try save(nil); revision &+= 1 }
            throw failure
        }
    }
    private func request(_ path: String, body: JSObject?, token: String? = nil) async throws -> JSObject {
        guard walkingSharingEnabled else { throw WalkingNativeError(code:"setup_required") }
        guard (["pair","confirm","sync","board","unpair"].contains(path) || HeartsPayload.permits(path)), let url = URL(string:"https://warming-up-bapmunna.web.app/api/walking/"+path) else { throw WalkingNativeError(code:"invalid_request") }
        var request = URLRequest(url:url); request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("capacitor://localhost", forHTTPHeaderField:"Origin"); request.setValue("application/json",forHTTPHeaderField:"Accept")
        if let token { request.setValue("Bearer "+token,forHTTPHeaderField:"Authorization") }
        if let body { request.setValue("application/json",forHTTPHeaderField:"Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject:body) }
        do {
            let (bytes, response) = try await network.data(for:request)
            guard let response = response as? HTTPURLResponse, bytes.count <= (HeartsPayload.permits(path) ? HeartsPayload.maxResponseBytes : 65536) else { throw WalkingNativeError(code:"invalid_response") }
            let object = (try? (HeartsPayload.permits(path) ? HeartsPayload.decode(bytes) : WalkingPayload.decode(bytes))) ?? [:]
            guard (200...299).contains(response.statusCode) else {
                let code = object["error"] as? String ?? "server_error"
                throw WalkingNativeError(code:code.range(of:"^[a-z_]{1,64}$",options:.regularExpression) == nil ? "server_error" : code,status:response.statusCode)
            }
            return object
        } catch let error as WalkingNativeError { throw error }
        catch { throw WalkingNativeError(code:"network_error") }
    }
    private func day(_ now: Date) -> String {
        let f = DateFormatter(); f.calendar = Calendar(identifier:.gregorian); f.locale = Locale(identifier:"en_US_POSIX"); f.timeZone = TimeZone(identifier:"Asia/Seoul"); f.dateFormat = "yyyy-MM-dd"; return f.string(from:now)
    }
    private func iso(_ value: Date) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return formatter.string(from:value)
    }
    private func parseISO(_ value: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return f.date(from:value) ?? ISO8601DateFormatter().date(from:value)
    }
}
