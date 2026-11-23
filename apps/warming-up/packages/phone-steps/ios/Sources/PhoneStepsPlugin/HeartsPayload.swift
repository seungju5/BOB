import Foundation
import CoreFoundation
import Capacitor

/** Narrow optional bridge: no caller URL, health count, or bearer in either direction. */
enum HeartsPayload {
    static let maxResponseBytes = 5 * 1024 * 1024
    static let reads: Set<String> = ["hearts", "heartleague"]
    static let writes: Set<String> = ["heartjoin", "heartsettings", "heartbuy", "heartequip", "heartread", "heartleave"]
    static let nonRevokingErrors: Set<String> = ["heart_consent_required", "heart_paused", "heart_league_consent_required", "heart_message_locked"]
    static func permits(_ action: String) -> Bool { reads.contains(action) || writes.contains(action) }
    private static func invalid() -> WalkingNativeError { WalkingNativeError(code:"invalid_heart_request") }
    private static func boolean(_ value: JSValue?) -> Bool {
        guard let value = value as? NSNumber else { return false }
        return CFGetTypeID(value) == CFBooleanGetTypeID()
    }

    static func validate(action: String, body: JSObject?) throws {
        guard permits(action) else { throw invalid() }
        if reads.contains(action) { guard body == nil else { throw invalid() }; return }
        guard let body, JSONSerialization.isValidJSONObject(body), try JSONSerialization.data(withJSONObject:body).count <= 2048 else { throw invalid() }
        func fields(_ allowed: Set<String>) throws { guard Set(body.keys).isSubset(of:allowed) else { throw invalid() } }
        func goal(_ value: JSValue?) throws {
            guard let number = WalkingPayload.integer(value), (500...20000).contains(number), number % 100 == 0 else { throw invalid() }
        }
        func region(_ value: JSValue?) throws {
            guard let value = value as? String, value.utf16.count <= 60, value.rangeOfCharacter(from:.controlCharacters) == nil else { throw invalid() }
        }
        func identifier(_ value: JSValue?, max: Int) throws {
            guard let value = value as? String, value.utf16.count <= max, value.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil else { throw invalid() }
        }
        switch action {
        case "heartjoin":
            try fields(["consentVersion", "enabled", "goal", "leagueEnabled", "region"])
            guard body["consentVersion"] as? String == "2026-11-17-hearts", boolean(body["enabled"]), body["enabled"] as? Bool == true, boolean(body["leagueEnabled"]) else { throw invalid() }
            try goal(body["goal"]); try region(body["region"])
        case "heartsettings":
            try fields(["goal", "enabled", "leagueEnabled", "region"])
            guard !body.isEmpty else { throw invalid() }
            if body["goal"] != nil { try goal(body["goal"]) }
            for key in ["enabled", "leagueEnabled"] where body[key] != nil { guard boolean(body[key]) else { throw invalid() } }
            if body["region"] != nil { try region(body["region"]) }
        case "heartbuy", "heartequip": try fields(["itemId"]); try identifier(body["itemId"],max:64)
        case "heartread": try fields(["id"]); try identifier(body["id"],max:128)
        case "heartleave": try fields([])
        default: throw invalid()
        }
    }
    static func decode(_ bytes: Data) throws -> JSObject {
        guard bytes.count <= maxResponseBytes,
              let dictionary = try JSONSerialization.jsonObject(with:bytes) as? NSDictionary,
              let result = JSTypes.coerceDictionaryToJSObject(dictionary) else { throw WalkingNativeError(code:"invalid_response") }
        return result
    }
    static func clean(action: String, value: JSObject) throws -> JSObject {
        var allowed: Set<String>
        if action == "heartleave" {
            guard boolean(value["ok"]), value["ok"] as? Bool == true else { throw WalkingNativeError(code:"invalid_response") }
            return ["ok":true]
        } else if action == "heartleague" {
            guard boolean(value["enabled"]), value["week"] is String, value["entries"] is [JSValue] else { throw WalkingNativeError(code:"invalid_response") }
            allowed = ["enabled", "week", "weekEnd", "practice", "region", "group", "total", "entries", "me", "updatedAt"]
        } else {
            guard boolean(value["enabled"]), boolean(value["joined"]) else { throw WalkingNativeError(code:"invalid_response") }
            if value["enabled"] as? Bool == true {
                guard value["state"] is JSObject, value["summary"] is JSObject else { throw WalkingNativeError(code:"invalid_response") }
            }
            allowed = ["enabled", "joined", "state", "summary", "messages", "leagueEnabled", "region", "updatedAt", "tier", "lastPromotionWeek"]
        }
        let privateKeys: Set<String> = ["token", "accesstoken", "refreshtoken", "authorization", "secret", "clientsecret", "password", "email", "uid", "owneruid", "devicekey", "generation", "authtime", "prototype", "proto", "constructor"]
        var budget = 20_000
        func safe(_ input: JSValue, depth: Int) throws -> JSValue {
            budget -= 1
            guard budget >= 0, depth <= 16 else { throw WalkingNativeError(code:"invalid_response") }
            if let object = input as? JSObject {
                var result: JSObject = [:]
                for (key, value) in object {
                    let canonical = key.lowercased().replacingOccurrences(of:"[^a-z0-9]",with:"",options:.regularExpression)
                    if key.utf16.count <= 128, !privateKeys.contains(canonical), !canonical.hasSuffix("token"), !canonical.hasSuffix("secret") { result[key] = try safe(value,depth:depth+1) }
                }
                return result
            }
            if let values = input as? [JSValue] {
                guard values.count <= 1000 else { throw WalkingNativeError(code:"invalid_response") }
                return try values.map { try safe($0,depth:depth+1) }
            }
            if let string = input as? String {
                guard string.utf16.count <= 230_000 else { throw WalkingNativeError(code:"invalid_response") }
                return string
            }
            if let number = input as? NSNumber {
                guard number.doubleValue.isFinite else { throw WalkingNativeError(code:"invalid_response") }
                return input
            }
            if input is NSNull { return input }
            throw WalkingNativeError(code:"invalid_response")
        }
        return try safe(value.filter { allowed.contains($0.key) },depth:0) as! JSObject
    }
}
