# Bapmunna PhoneSteps

Private Capacitor 8 plugin. It reads **Samsung Health steps through Health Connect** on Android and **Apple Health stepCount through HealthKit** on iPhone. These are health-store totals, potentially including a watch; the app must not label them as phone-sensor-only data. The earlier Recording API/CMPedometer proposal was replaced after the user's explicit health-app preference on 2026-11-14.

```ts
import { PhoneSteps, isPhoneStepsNativeAvailable, type PhoneStepsSnapshot } from '@bapmunna/phone-steps';

if (isPhoneStepsNativeAvailable()) {
  // Only inside the real senior session, never a synthetic demo.
  const state = await PhoneSteps.status();
  // A connect button may call await PhoneSteps.connect().
}
```

`status()` and `readToday()` never show a permission prompt. `connect()` is for an explicit user click. `disconnect()` disables this app's reads and clears its consent flags; it neither deletes health records nor revokes another application's permissions. Revoke OS health access in the OS health settings. `openSettings()` opens Health Connect settings on supported Android, the Health Connect Play listing on Android 13 and lower if installation/update is needed, or system settings if unavailable. On iPhone it uses the public app-settings URL; the UI also needs directions to **Health → Sharing → Apps → Bapmunna**. These destinations still need real-device verification.

## Result and privacy semantics

The complete contract is [src/index.d.ts](src/index.d.ts). Only `ready` returns a nonnegative integer. `no-data` is null, never synthetic zero. `updatedAt` means query completion, not measurement or Samsung synchronization time. `localDate` and `timeZone` are the current device's Gregorian date and time zone; meal judgement retains its separate KST rules. Both health-store adapters set `trackingSince=null` and `partialDay=false`: app connection time does not delimit existing health records. This flag is not a guarantee of complete sensor coverage.

Android reads `StepsRecord.COUNT_TOTAL` with **only** `DataOrigin("com.sec.android.app.shealth")`; it never falls back to all origins. Samsung Health must have step-write sharing to Health Connect enabled separately. An empty result cannot diagnose missing Samsung linkage. On iPhone, successful authorization completion does **not** prove read access. HealthKit hides read denial; empty/denied read results therefore show `no-data`, not an invented permission decision. No write, location, workout, heart-rate, history, or background-reading permissions are requested.

All callbacks after disconnect/superseding connect are rejected as `STALE_REQUEST`. Day or time-zone changes re-query once rather than relabeling yesterday's count as today. Android reads recheck its read grant after the aggregate request. Nothing logs, uploads, or persists step totals. Only device-local consent flags persist. Parent UI must invalidate its own results on account/logout changes and call disconnect; native state is per installation, not per remote account.

The existing app uses `lib/steps/consent.ts` as this boundary; UI should use its `seniorPhoneSteps` wrapper instead of bypassing it with direct calls. Pairing changes persist a reset-pending marker before changing the token. New reads wait for native disconnection, including after an interrupted reset and app restart. The marker contains no health count or account identifier.

iOS uses a `HKStatisticsCollectionQuery` with the device's Gregorian calendar, local-midnight anchor, and a **calendar day** interval. The sample predicate includes records overlapping the boundary; HealthKit supplies the day's cumulative bucket instead of discarding samples that began before midnight. The returned day boundaries are checked, and no fixed 86,400-second day is assumed. Midnight-spanning samples, DST, changing time zones, and comparison with Apple Health still require physical-device proof.

## Native requirements

- Capacitor core/cli/android/ios **8.6.2**, Node 22+. Web fallback is explicitly unsupported and does not read browser motion sensors.
- Android: chosen app minimum **API 29 / Android 10**, compile/target 36, AGP 8.13.0, Kotlin 2.2.20, `androidx.health.connect:connect-client:1.1.0`, `kotlinx-coroutines-android:1.10.2`. Host declares **READ_STEPS only**, Health Connect package visibility, and a permissions-rationale activity. Android 14+ includes Health Connect; older supported Android needs the provider app. Availability is checked at runtime. The new Health Connect built-in phone-tracking extension APIs are deliberately unnecessary here.
- iPhone: **iOS 15+** through this Capacitor host, Xcode 26+. System HealthKit framework, `NSHealthShareUsageDescription`, HealthKit entitlement. No `NSHealthUpdateUsageDescription`, write types, or background delivery. Swift Package Manager is supported; CocoaPods publishing is not configured.
- The bridge accepts only the packaged `https://localhost` Android / `capacitor://localhost` iOS app. Do not configure `server.url` or `allowNavigation` to a remote host.

## Evidence and remaining checks

`npm test` verifies the browser fallback and executes the Java date/empty-value helper with the local JDK. It does not compile the Android plugin or the iOS target. No Android SDK, Android Studio, or Xcode was available for this work. No real steps, health permissions, OEM data synchronization, or device background/resume behavior has been verified yet.

Before a native pilot, build the host in `workspaces/bapmunna-mobile`, verify login/pairing and app-return URLs, then test on physical Android and iPhone: fresh connection, decline, later revoke, no records versus explicit zero, background walking then resume, restart, date/time-zone transition, mid-query disconnect, no Samsung sharing, other-origin records that must be excluded, multi-source Apple Health totals, and account switching. Native signing/entitlements, store health declarations, policy content, icons, and accessibility need release review. No store publication, billing, cloud deployment, or credential changes occurred.

## Primary documentation (checked 2026-11-14)

- [Health Connect setup and permissions](https://developer.android.com/health-and-fitness/health-connect/get-started)
- [Aggregate and filter by data origin](https://developer.android.com/health-and-fitness/health-connect/aggregate-data)
- [Stable Health Connect release](https://developer.android.com/jetpack/androidx/releases/health-connect)
- [Samsung Health ↔ Health Connect FAQ](https://developer.samsung.com/health/health-connect-faq.html)
- [HealthKit authorization and read-denial privacy](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [HealthKit daily statistics collections](https://developer.apple.com/documentation/healthkit/hkstatisticscollectionquery)
- [Apple's daily step-query example, WWDC20](https://developer.apple.com/videos/play/wwdc2020/10664/)
- [Capacitor 8 platform requirements](https://capacitorjs.com/docs/updating/8-0)
- [Capacitor local bundle configuration](https://capacitorjs.com/docs/config)
