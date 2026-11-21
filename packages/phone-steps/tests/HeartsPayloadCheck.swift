import Foundation
import Capacitor

@main struct HeartsPayloadCheck {
    static func require(_ condition: Bool, _ message: String) { precondition(condition,message) }
    static func rejected(_ operation: () throws -> Void) {
        do { try operation(); preconditionFailure("Unsafe hearts payload accepted") } catch {}
    }
    static func main() throws {
        for action in ["hearts", "heartleague"] {
            try HeartsPayload.validate(action:action,body:nil)
            rejected { try HeartsPayload.validate(action:action,body:[:]) }
        }
        let join: JSObject = ["consentVersion":"2026-11-17-hearts", "enabled":true, "goal":5000, "leagueEnabled":false, "region":""]
        try HeartsPayload.validate(action:"heartjoin",body:join)
        for goal: JSValue in [0,499,20100,550,true,"5000",Double.infinity,NSNull()] {
            var bad = join; bad["goal"] = goal
            rejected { try HeartsPayload.validate(action:"heartjoin",body:bad) }
        }
        for goal in [500,5000,20000] { try HeartsPayload.validate(action:"heartsettings",body:["goal":goal]) }
        for action in ["heartmessage", "heartgift", "sync", "pair", "../hearts", "hearts?token=x", "https://evil.test", "Hearts", ""] {
            rejected { try HeartsPayload.validate(action:action,body:[:]) }
        }
        var noConsent = join; noConsent["enabled"] = false
        rejected { try HeartsPayload.validate(action:"heartjoin",body:noConsent) }
        var count = join; count["count"] = 5000
        rejected { try HeartsPayload.validate(action:"heartjoin",body:count) }
        for bad: JSObject in [["token":"secret"], ["url":"https://evil.test"], ["enabled":1], ["region":"지역\n위치"], [:]] {
            rejected { try HeartsPayload.validate(action:"heartsettings",body:bad) }
        }
        try HeartsPayload.validate(action:"heartsettings",body:["enabled":false])
        for action in ["heartbuy", "heartequip"] {
            try HeartsPayload.validate(action:action,body:["itemId":"straw-hat"])
            rejected { try HeartsPayload.validate(action:action,body:["itemId":"hat","price":0]) }
        }
        try HeartsPayload.validate(action:"heartread",body:["id":"msg_123"])
        try HeartsPayload.validate(action:"heartleave",body:[:])
        rejected { try HeartsPayload.validate(action:"heartleave",body:["uid":"someone"]) }
        let decoded = try HeartsPayload.decode(Data(#"{"enabled":true,"joined":true,"state":{"wallet":3,"token":"hidden","idToken":"hidden","device_token":"hidden","days":[{"count":null,"authorization":"private"}]},"summary":{"count":0},"messages":[{"id":"m1","text":"응원해요","photo":"data:image/png;base64,eA==","uid":"private"}],"leagueEnabled":false,"token":"private","unknown":"hidden"}"#.utf8))
        let clean = try HeartsPayload.clean(action:"hearts",value:decoded)
        require(clean["token"] == nil && clean["unknown"] == nil, "Only documented wrapper fields cross the bridge")
        let state = clean["state"] as! JSObject, days = state["days"] as! [JSObject], summary = clean["summary"] as! JSObject
        require(state["token"] == nil && state["idToken"] == nil && state["device_token"] == nil && days[0]["authorization"] == nil, "Nested credentials do not cross the bridge")
        require(days[0]["count"] is NSNull && summary["count"] as? Int == 0, "No-data and genuine zero stay distinct")
        let messages = clean["messages"] as! [JSObject]
        require(messages[0]["uid"] == nil && messages[0]["text"] as? String == "응원해요", "Only authorized content retained; no private IDs")
        require(messages[0]["photo"] as? String == "data:image/png;base64,eA==", "Bounded attachment passes to app validation")
        let paused = try HeartsPayload.clean(action:"hearts",value:["enabled":false,"joined":true])
        require(paused["enabled"] as? Bool == false, "Pause is not invented enabled success")
        require(HeartsPayload.nonRevokingErrors.contains("heart_consent_required"), "New optional consent errors retain existing walking link")
        require(!HeartsPayload.nonRevokingErrors.contains("device_expired"), "Expired credentials still revoke")
        rejected { _ = try HeartsPayload.clean(action:"hearts",value:["enabled":true,"joined":true]) }
        rejected { _ = try HeartsPayload.clean(action:"hearts",value:["enabled":0,"joined":true]) }
        rejected { _ = try HeartsPayload.clean(action:"heartleave",value:["ok":1]) }
        rejected { _ = try HeartsPayload.decode(Data("[]".utf8)) }
        rejected { _ = try HeartsPayload.decode(Data(repeating:32,count:HeartsPayload.maxResponseBytes+1)) }
        var nested: JSObject = ["count":0]
        for _ in 0..<18 { nested = ["nested":nested] }
        rejected { _ = try HeartsPayload.clean(action:"hearts",value:["enabled":true,"joined":true,"state":nested,"summary":[:]]) }
        print("HeartsPayload: fixed-route request validation, optional-consent errors, bounded JSON and recursive secret filtering passed.")
    }
}
