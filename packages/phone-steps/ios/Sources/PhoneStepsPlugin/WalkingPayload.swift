import Foundation
import CoreFoundation
import Capacitor

struct WalkingNativeError: Error { let code: String; var status: Int = 0 }

/** The JSON-to-JS boundary emits only the documented public ranking fields. */
enum WalkingPayload {
    enum ReadAction { case upload, skip, stale }
    static func afterRead(status: String, sameRevision: Bool, consent: Bool, foreground: Bool) -> ReadAction {
        guard sameRevision else { return .stale }
        guard status == "ready" else { return .skip }
        return consent && foreground ? .upload : .stale
    }
    static func decode(_ bytes: Data) throws -> JSObject {
        guard bytes.count <= 65536,
              let dictionary = try JSONSerialization.jsonObject(with:bytes) as? NSDictionary,
              let result = JSTypes.coerceDictionaryToJSObject(dictionary) else { throw WalkingNativeError(code:"invalid_response") }
        return result
    }
    static func integer(_ value: JSValue?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let decimal = number.doubleValue
        guard decimal.isFinite, decimal >= 0, decimal <= 9_007_199_254_740_991, decimal.rounded(.towardZero) == decimal else { return nil }
        return number.intValue
    }
    static func cleanBoard(_ value: JSObject, now: Date) throws -> JSObject {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier:.gregorian)
        formatter.locale = Locale(identifier:"en_US_POSIX"); formatter.timeZone = TimeZone(identifier:"Asia/Seoul"); formatter.dateFormat = "yyyy-MM-dd"
        guard let date = value["date"] as? String, date == formatter.string(from:now), value["timeZone"] as? String == "Asia/Seoul",
              let entries = value["entries"] as? [JSObject], entries.count <= 50, let me = value["me"] as? JSObject,
              let total = integer(value["total"]), let updated = value["updatedAt"] as? String, validTime(updated) else { throw WalkingNativeError(code:"invalid_response") }
        func row(_ input: JSObject, own: Bool) throws -> JSObject {
            guard let id = input["publicId"] as? String, !id.isEmpty, id.count <= 100, let nickname = input["nickname"] as? String, !nickname.isEmpty, nickname.count <= 30 else { throw WalkingNativeError(code:"invalid_response") }
            let count = integer(input["count"]), rank = integer(input["rank"])
            guard (own && input["count"] is NSNull) || count != nil,
                  (own && input["rank"] is NSNull) || (rank != nil && rank! > 0) else { throw WalkingNativeError(code:"invalid_response") }
            var result: JSObject = ["publicId":id,"nickname":nickname,"count":count.map { $0 as JSValue } ?? NSNull(),"rank":rank.map { $0 as JSValue } ?? NSNull()]
            if own {
                if let synced = input["lastSyncedAt"] as? String, validTime(synced) { result["lastSyncedAt"] = synced }
                else if input["lastSyncedAt"] is NSNull { result["lastSyncedAt"] = NSNull() }
                else { throw WalkingNativeError(code:"invalid_response") }
            }
            return result
        }
        return ["date":date,"timeZone":"Asia/Seoul","updatedAt":updated,"entries":try entries.map { try row($0,own:false) },"me":try row(me,own:true),"total":total,"limit":50]
    }
    private static func validTime(_ value: String) -> Bool {
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return fractional.date(from:value) != nil || ISO8601DateFormatter().date(from:value) != nil
    }
}
