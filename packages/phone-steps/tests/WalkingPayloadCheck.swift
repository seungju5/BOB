import Foundation
import Capacitor

@main struct WalkingPayloadCheck {
    static func require(_ condition: Bool, _ message: String) { precondition(condition, message) }
    static func rejected(_ operation: () throws -> Void) {
        do { try operation(); preconditionFailure("Invalid response was accepted") } catch { }
    }
    static func main() throws {
        require(try WalkingPayload.sharingScope(nil) == "public", "Legacy scope remains public")
        require(try WalkingPayload.sharingScope("private") == "private", "Private scope is preserved")
        for wrong: JSValue in ["PRIVATE", "friends", false, 0, NSNull()] { rejected { _ = try WalkingPayload.sharingScope(wrong) } }
        let privateConfirmation = try WalkingPayload.confirmationBody(scope:"private",version:"2026-11-17-private",share:true,shareRanking:false)
        require(privateConfirmation["shareRanking"] as? Bool == false, "Private confirmation does not permit public sharing")
        let legacyConfirmation = try WalkingPayload.confirmationBody(scope:"public",version:"2026-11-17",share:true,shareRanking:nil)
        require(legacyConfirmation["shareRanking"] == nil, "Legacy public body stays compatible")
        for wrong: JSValue in [true, "false", 0, NSNull()] { rejected { _ = try WalkingPayload.confirmationBody(scope:"private",version:"2026-11-17-private",share:true,shareRanking:wrong) } }
        rejected { _ = try WalkingPayload.confirmationBody(scope:"private",version:"2026-11-17-private",share:true,shareRanking:nil) }
        rejected { _ = try WalkingPayload.confirmationBody(scope:"private",version:"2026-11-17",share:true,shareRanking:false) }
        rejected { _ = try WalkingPayload.confirmationBody(scope:"private",version:"2026-11-17-private",share:false,shareRanking:false) }
        rejected { _ = try WalkingPayload.confirmationBody(scope:"public",version:"2026-11-17-private",share:true,shareRanking:false) }
        rejected { _ = try WalkingPayload.confirmationBody(scope:"public",version:"2026-11-17",share:true,shareRanking:false) }
        rejected { _ = try WalkingPayload.confirmationBody(scope:"friends",version:"2026-11-17",share:true,shareRanking:nil) }
        let now = ISO8601DateFormatter().date(from:"2026-11-17T12:00:00Z")!
        let bytes = Data(#"{"date":"2026-11-17","timeZone":"Asia/Seoul","updatedAt":"2026-11-17T12:00:00.000Z","total":1,"limit":50,"token":"never-return-this","entries":[{"publicId":"public_1","nickname":"산책토끼","count":0,"rank":1,"email":"do-not-return"}],"me":{"publicId":"public_me","nickname":"나","count":null,"rank":null,"lastSyncedAt":null,"token":"also-private"}}"#.utf8)
        let decoded = try WalkingPayload.decode(bytes)
        let board = try WalkingPayload.cleanBoard(decoded,now:now)
        require(board["token"] == nil, "Unknown fields must not cross native-to-JS boundary")
        let entries = board["entries"] as! [JSObject]
        require(entries[0]["email"] == nil, "Rows must be allowlisted")
        require(entries[0]["count"] as? Int == 0, "A real zero is retained")
        let me = board["me"] as! JSObject
        require(me["count"] is NSNull && me["rank"] is NSNull, "Absence is not turned into zero or a rank")
        require(me["token"] == nil, "Private fields are never returned")
        var privateBoard = decoded; privateBoard["entries"] = [JSObject](); privateBoard["total"] = 0
        let privateResult = try WalkingPayload.cleanBoard(privateBoard,now:now,sharingScope:"private")
        require((privateResult["me"] as! JSObject)["count"] is NSNull, "Private board does not invent a public count")
        rejected { _ = try WalkingPayload.cleanBoard(decoded,now:now,sharingScope:"private") }
        var leaked = privateBoard; var leakedMe = me; leakedMe["count"] = 100; leaked["me"] = leakedMe
        rejected { _ = try WalkingPayload.cleanBoard(leaked,now:now,sharingScope:"private") }
        require(WalkingPayload.afterRead(status:"not-connected",sameRevision:true,consent:false,foreground:true) == .skip, "Initially disconnected health leaves board available")
        require(WalkingPayload.afterRead(status:"no-data",sameRevision:true,consent:true,foreground:true) == .skip, "Missing data skips upload")
        require(WalkingPayload.afterRead(status:"not-connected",sameRevision:false,consent:false,foreground:true) == .stale, "Consent changed during read invalidates response")
        require(WalkingPayload.afterRead(status:"ready",sameRevision:true,consent:false,foreground:true) == .stale, "Disabled consent blocks a ready result")
        require(WalkingPayload.afterRead(status:"ready",sameRevision:true,consent:true,foreground:false) == .stale, "Backgrounded app cannot upload")
        require(WalkingPayload.afterRead(status:"ready",sameRevision:true,consent:true,foreground:true) == .upload, "Current ready data is uploadable")
        require(WalkingPayload.integer(false) == nil, "JSON booleans are not numeric totals")
        require(WalkingPayload.integer(1.5) == nil, "Fractional steps are not accepted from the API")
        require(WalkingPayload.integer(-1) == nil, "Negative steps are rejected")
        require(WalkingPayload.integer(Double.infinity) == nil, "Non-finite values are rejected")
        require(WalkingPayload.integer(9_007_199_254_740_992.0) == nil, "Unsafe JS integers are rejected")
        var wrongDay = decoded; wrongDay["date"] = "2026-11-16"
        rejected { _ = try WalkingPayload.cleanBoard(wrongDay,now:now) }
        var wrongZone = decoded; wrongZone["timeZone"] = "UTC"
        rejected { _ = try WalkingPayload.cleanBoard(wrongZone,now:now) }
        var missing = decoded; var missingMe = me; missingMe.removeValue(forKey:"count"); missing["me"] = missingMe
        rejected { _ = try WalkingPayload.cleanBoard(missing,now:now) }
        rejected { _ = try WalkingPayload.decode(Data("[]".utf8)) }
        rejected { _ = try WalkingPayload.decode(Data(repeating:32,count:65537)) }
        print("WalkingPayload: pinned private/public consent, actual Capacitor JSON coercion, secret filtering, zero/absence and date/number validation passed.")
    }
}
