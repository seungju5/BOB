import Foundation
import UserNotifications
import Capacitor

/** Device-local opt-in notifications. No health query or remote message service. */
@MainActor final class WalkReminderCenter: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private let prefix = "warmingup.walk."
    private var revision: UInt64 = 0
    private var configuring = false
    override init() { super.init(); if center.delegate == nil { center.delegate = self } }
    func status() async -> JSObject {
        let settings = await center.notificationSettings()
        let permission = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional ? "granted" : settings.authorizationStatus == .notDetermined ? "prompt" : "denied"
        return ["enabled":defaults.bool(forKey:prefix+"enabled"),
                "times":defaults.stringArray(forKey:prefix+"times") ?? [],"bloodSugarReminder":defaults.bool(forKey:prefix+"glucose"),"permission":permission]
    }
    func configure(enabled: Bool, times: [String], glucose: Bool) async throws -> JSObject {
        guard !enabled || (!times.isEmpty && times.count <= 4 && Set(times).count == times.count && times.allSatisfy { $0.range(of:"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$",options:.regularExpression) != nil }) else { throw WalkingNativeError(code:"invalid_reminder_times") }
        if enabled && configuring { throw WalkingNativeError(code:"permission_request_pending") }
        revision &+= 1; let expected = revision
        defaults.set(false,forKey:prefix+"enabled")
        if !enabled {
            defaults.removeObject(forKey:prefix+"times"); defaults.set(false,forKey:prefix+"glucose")
            await cancelOld(); return await status()
        }
        configuring = true; defer { configuring = false }
        let settings = await center.notificationSettings()
        var allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        if settings.authorizationStatus == .notDetermined { allowed = try await center.requestAuthorization(options:[.alert,.sound]) }
        guard expected == revision else { throw WalkingNativeError(code:"stale_request") }
        await cancelOld()
        guard expected == revision else { throw WalkingNativeError(code:"stale_request") }
        guard allowed else { return await status() }
        let group = prefix + UUID().uuidString + "."
        var created: [String] = []
        do {
            for (index, time) in times.sorted().enumerated() {
                let parts = time.split(separator:":").compactMap { Int($0) }
                let content = UNMutableNotificationContent(); content.title = "밥뭇나 · 가벼운 산책 시간"
                content.body = "식사를 마치셨다면, 몸이 편할 때 가볍게 걸어볼까요?" + (glucose ? " 혈당을 재는 분은 안내받은 측정 시각도 확인해 주세요." : "")
                content.sound = .default
                // No fixed time zone: follows the phone's calendar wall-clock time.
                let trigger = UNCalendarNotificationTrigger(dateMatching:DateComponents(hour:parts[0],minute:parts[1]),repeats:true)
                let id = group + String(index); created.append(id)
                try await center.add(UNNotificationRequest(identifier:id,content:content,trigger:trigger))
                guard expected == revision else { throw WalkingNativeError(code:"stale_request") }
            }
            defaults.set(true,forKey:prefix+"enabled"); defaults.set(times.sorted(),forKey:prefix+"times"); defaults.set(glucose,forKey:prefix+"glucose")
            return await status()
        } catch { center.removePendingNotificationRequests(withIdentifiers:created); throw error }
    }
    private func cancelOld() async {
        let pending = (await center.pendingNotificationRequests()).filter { $0.identifier.hasPrefix(prefix) }.map(\.identifier)
        center.removePendingNotificationRequests(withIdentifiers:pending)
        let delivered = (await center.deliveredNotifications()).filter { $0.request.identifier.hasPrefix(prefix) }.map { $0.request.identifier }
        center.removeDeliveredNotifications(withIdentifiers:delivered)
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                           withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler(notification.request.identifier.hasPrefix("warmingup.walk.") ? [.banner,.sound] : [])
    }
}
