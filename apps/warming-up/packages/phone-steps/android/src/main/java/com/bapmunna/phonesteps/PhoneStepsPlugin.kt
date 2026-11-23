package com.bapmunna.phonesteps

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

/** Reads Samsung Health records from Health Connect; never records or writes steps. */
@CapacitorPlugin(name = "PhoneSteps", permissions = [Permission(alias = "walkNotifications", strings = [Manifest.permission.POST_NOTIFICATIONS])])
class PhoneStepsPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val readPermissions = setOf(HealthPermission.getReadPermission(StepsRecord::class))
    private val permissionContract = PermissionController.createRequestPermissionResultContract()
    @Volatile private var generation = 0L
    @Volatile private var foreground = true
    private var pendingPermission: Pair<String, Long>? = null
    private val callGenerations = mutableMapOf<String, Long>()
    private lateinit var preferences: SharedPreferences
    private lateinit var walking: WalkingClient
    private val rankReads = Mutex()
    private var reminderGeneration = 0L
    private var pendingReminderPermission: Pair<String, Long>? = null

    override fun load() {
        preferences = context.getSharedPreferences("warming_up_health_steps", Context.MODE_PRIVATE)
        walking = WalkingClient(context)
        WalkingReminders.schedule(context)
    }

    @PluginMethod fun status(call: PluginCall) = launchCall(call) { read(call, generation) }
    @PluginMethod fun readToday(call: PluginCall) = launchCall(call) { read(call, generation) }

    @PluginMethod fun readRankingToday(call: PluginCall) = launchWalking(call) { rankReads.withLock { call.resolve(readRankSnapshot()) } }
    @PluginMethod fun rankingStatus(call: PluginCall) = launchWalking(call) { call.resolve(walking.status()) }
    @PluginMethod fun rankingLink(call: PluginCall) = launchWalking(call) { call.resolve(walking.link(call.getString("code") ?: "")) }
    @PluginMethod fun rankingConfirm(call: PluginCall) = launchWalking(call) { call.resolve(walking.confirm(call.getString("consentVersion") ?: "", call.data.opt("shareTodaySteps") == true, call.data.opt("shareRanking"))) }
    @PluginMethod fun rankingBoard(call: PluginCall) = launchWalking(call) { call.resolve(walking.board()) }
    @PluginMethod fun rankingDisconnect(call: PluginCall) = launchWalking(call) { walking.disconnect(); call.resolve() }
    @PluginMethod fun heartsRequest(call: PluginCall) = launchWalking(call) {
        if (call.data.keys().asSequence().any { it !in setOf("action", "body") } || call.data.has("body") && call.getObject("body") == null) throw WalkingFailure("invalid_heart_request")
        call.resolve(walking.hearts(call.getString("action") ?: "", call.getObject("body")))
    }
    @PluginMethod fun rankingSync(call: PluginCall) = launchWalking(call) {
        rankReads.withLock {
            if (!walking.isReady()) {
                val state = walking.status()
                if (state.optBoolean("revokePending")) walking.disconnect()
                call.resolve(JSObject().put("ok", false).put("reason", "not-linked")); return@withLock
            }
            val linkRevision = walking.revision
            val healthRevision = generation
            val value = readRankSnapshot()
            when (RankingReadDecision.afterRead(value.optString("status"), healthRevision == generation, preferences.getBoolean("enabled", false), foreground)) {
                RankingReadDecision.Action.STALE -> throw WalkingFailure("stale_request")
                RankingReadDecision.Action.SKIP -> { call.resolve(JSObject().put("ok", false).put("reason", value.optString("status", "no-data"))); return@withLock }
                RankingReadDecision.Action.UPLOAD -> Unit
            }
            call.resolve(walking.sync(value, linkRevision,
                healthPermitted = { HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE && HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().containsAll(readPermissions) },
                stillCurrent = { foreground && healthRevision == generation && preferences.getBoolean("enabled", false) }))
        }
    }
    @PluginMethod fun openWalkingWebApp(call: PluginCall) = launchWalking(call) {
        activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEB_APP_URL + "walking/")).apply { addCategory(Intent.CATEGORY_BROWSABLE) })
        call.resolve()
    }
    @PluginMethod fun walkReminderStatus(call: PluginCall) = launchWalking(call) { call.resolve(WalkingReminders.status(context)) }
    @PluginMethod fun configureWalkReminders(call: PluginCall) = launchWalking(call) {
        val enabled = call.getBoolean("enabled") == true
        if (enabled && pendingReminderPermission != null) throw WalkingFailure("permission_request_pending")
        ++reminderGeneration
        reminderInput(call) // Validate before requesting any permission.
        if (enabled && Build.VERSION.SDK_INT >= 33 && getPermissionState("walkNotifications") != PermissionState.GRANTED) {
            pendingReminderPermission = Pair(call.callbackId, reminderGeneration)
            requestPermissionForAlias("walkNotifications", call, "walkNotificationPermissionResult")
        } else call.resolve(applyReminderInput(call))
    }
    @PermissionCallback private fun walkNotificationPermissionResult(call: PluginCall) = launchWalking(call) {
        val pending = pendingReminderPermission; pendingReminderPermission = null
        if (pending == null || pending.first != call.callbackId || pending.second != reminderGeneration) throw WalkingFailure("stale_request")
        call.resolve(applyReminderInput(call))
    }
    private fun reminderInput(call: PluginCall): List<String> {
        val array = call.getArray("times") ?: throw WalkingFailure("invalid_reminder_times")
        val values = (0 until array.length()).map { array.optString(it, "") }
        if (call.getBoolean("enabled") == true && (values.isEmpty() || values.size > 4 || values.distinct().size != values.size || values.any { !WalkReminderTime.valid(it) })) throw WalkingFailure("invalid_reminder_times")
        return values
    }
    private fun applyReminderInput(call: PluginCall) = WalkingReminders.configure(context, call.getBoolean("enabled") == true, reminderInput(call), call.getBoolean("bloodSugarReminder") == true)

    private suspend fun readRankSnapshot(): JSObject {
        val revision = generation
        val window = StepWindow(Instant.now(), ZoneId.of("Asia/Seoul"))
        fun result(status: String, count: Long? = null, reason: String? = null) = snapshot(status, count, window, reason).apply { put("queriedAt", window.end.toString()) }
        if (!preferences.getBoolean("enabled", false)) return result("not-connected")
        if (!foreground) throw WalkingFailure("app_backgrounded")
        val availability = HealthConnectClient.getSdkStatus(context)
        if (availability != HealthConnectClient.SDK_AVAILABLE) return result("unsupported", reason = "health-connect-unavailable")
        val client = HealthConnectClient.getOrCreate(context)
        if (!client.permissionController.getGrantedPermissions().containsAll(readPermissions)) return result("permission-denied", reason = "permission-revoked")
        if (!foreground || generation != revision || !preferences.getBoolean("enabled", false)) throw WalkingFailure("stale_request")
        if (!window.start.isBefore(window.end)) return result("no-data")
        val value = client.aggregate(AggregateRequest(metrics = setOf(StepsRecord.COUNT_TOTAL), timeRangeFilter = TimeRangeFilter.between(window.start, window.end), dataOriginFilter = setOf(DataOrigin(SAMSUNG_HEALTH_PACKAGE))))
        if (generation != revision || !preferences.getBoolean("enabled", false)) throw WalkingFailure("stale_request")
        if (!client.permissionController.getGrantedPermissions().containsAll(readPermissions)) return result("permission-denied", reason = "permission-revoked")
        if (!window.isCurrent(Instant.now(), ZoneId.of("Asia/Seoul"))) return result("no-data")
        val count = StepWindow.validateCount(value[StepsRecord.COUNT_TOTAL])
        return result(if (count == null) "no-data" else "ready", count)
    }

    private fun launchWalking(call: PluginCall, block: suspend () -> Unit) {
        scope.launch {
            if (!trusted(call)) return@launch
            try { block() }
            catch (cancelled: CancellationException) { call.reject("요청이 취소됐어요.", "stale_request"); throw cancelled }
            catch (error: WalkingFailure) { call.reject("연결 상태를 확인해 주세요.", error.code) }
            catch (_: Exception) { call.reject("잠시 후 다시 확인해 주세요.", "walking_unavailable") }
        }
    }

    @PluginMethod fun connect(call: PluginCall) = launchCall(call) {
        val client = clientOrResolve(call) ?: return@launchCall
        if (pendingPermission != null) {
            call.reject("A health permission request is already open.", "PERMISSION_REQUEST_PENDING")
            return@launchCall
        }
        val requestGeneration = ++generation
        callGenerations[call.callbackId] = requestGeneration
        preferences.edit().putBoolean("enabled", true).apply()
        val granted = client.permissionController.getGrantedPermissions()
        if (!current(call, requestGeneration)) return@launchCall
        if (granted.containsAll(readPermissions)) {
            preferences.edit().putBoolean("hadReadPermission", true).apply()
            read(call, requestGeneration)
        } else {
            pendingPermission = Pair(call.callbackId, requestGeneration)
            try {
                startActivityForResult(call, permissionContract.createIntent(context, readPermissions), "healthPermissionsResult")
            } catch (error: Exception) {
                pendingPermission = null
                throw error
            }
        }
    }

    @ActivityCallback
    private fun healthPermissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) { pendingPermission = null; return }
        val pending = pendingPermission
        pendingPermission = null
        if (pending == null || pending.first != call.callbackId) {
            call.reject("The permission request is no longer current.", "STALE_REQUEST")
            return
        }
        launchCall(call) {
            if (!current(call, pending.second)) return@launchCall
            val client = clientOrResolve(call) ?: return@launchCall
            // Query the current grant again instead of trusting a cached activity result.
            val granted = client.permissionController.getGrantedPermissions()
            if (!current(call, pending.second)) return@launchCall
            if (granted.containsAll(readPermissions)) {
                preferences.edit().putBoolean("hadReadPermission", true).putBoolean("permissionRequested", true).apply()
                read(call, pending.second)
            } else {
                preferences.edit().putBoolean("permissionRequested", true).apply()
                call.resolve(snapshot("permission-denied", reason = deniedReason()))
            }
        }
    }

    private suspend fun read(call: PluginCall, requestGeneration: Long, retry: Int = 0) {
        if (!current(call, requestGeneration)) return
        if (!preferences.getBoolean("enabled", false)) {
            call.resolve(snapshot("not-connected")); return
        }
        val client = clientOrResolve(call) ?: return
        val granted = client.permissionController.getGrantedPermissions()
        if (!current(call, requestGeneration)) return
        if (!granted.containsAll(readPermissions)) {
            val asked = preferences.getBoolean("permissionRequested", false) || preferences.getBoolean("hadReadPermission", false)
            call.resolve(snapshot(if (asked) "permission-denied" else "permission-required", reason = deniedReason()))
            return
        }
        preferences.edit().putBoolean("hadReadPermission", true).apply()
        val window = StepWindow(Instant.now(), ZoneId.systemDefault())
        if (!window.start.isBefore(window.end)) {
            call.resolve(snapshot("no-data", window = window)); return
        }
        val aggregate = client.aggregate(AggregateRequest(
            metrics = setOf(StepsRecord.COUNT_TOTAL),
            timeRangeFilter = TimeRangeFilter.between(window.start, window.end),
            dataOriginFilter = setOf(DataOrigin(SAMSUNG_HEALTH_PACKAGE))
        ))
        if (!current(call, requestGeneration)) return
        // Recheck after the asynchronous read, since the user can revoke at any time.
        val stillGranted = client.permissionController.getGrantedPermissions().containsAll(readPermissions)
        if (!current(call, requestGeneration)) return
        if (!stillGranted) {
            call.resolve(snapshot("permission-denied", reason = "permission-revoked")); return
        }
        if (!window.isCurrent(Instant.now(), ZoneId.systemDefault())) {
            if (retry == 0) read(call, requestGeneration, 1)
            else call.resolve(snapshot("error", reason = "provider-error"))
            return
        }
        // Empty results do not distinguish no steps, no Samsung sync, or no current records.
        val count = StepWindow.validateCount(aggregate[StepsRecord.COUNT_TOTAL])
        call.resolve(snapshot(if (count == null) "no-data" else "ready", count, window))
    }

    @PluginMethod fun disconnect(call: PluginCall) = launchCall(call) {
        generation++
        callGenerations[call.callbackId] = generation
        preferences.edit().clear().apply()
        // First stop every new read/upload, then revoke the scoped rank device.
        // A failed network revoke remains durably pending and blocks future uploads.
        try { walking.disconnect() } catch (_: Exception) {}
        // Deliberately do not revokeAllPermissions/deleteRecords or alter Samsung Health.
        call.resolve(snapshot("not-connected"))
    }

    @PluginMethod fun openSettings(call: PluginCall) = launchCall(call) {
        val availability = HealthConnectClient.getSdkStatus(context)
        val intent = when {
            availability == HealthConnectClient.SDK_AVAILABLE -> Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            availability == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED && Build.VERSION.SDK_INT < 34 ->
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"))
            else -> Intent(Settings.ACTION_SETTINGS)
        }
        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (_: RuntimeException) {
            call.reject("건강 연결 설정을 열 수 없어요.", "SETTINGS_UNAVAILABLE")
        }
    }

    @PluginMethod fun openWebApp(call: PluginCall) = launchCall(call) {
        try {
            // Never place an external account page inside the privileged WebView.
            // This path is outside our health-only App Links intent filter.
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEB_APP_URL)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
            })
            call.resolve()
        } catch (_: RuntimeException) {
            call.reject("웹앱을 열 수 없어요.", "BROWSER_UNAVAILABLE")
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        foreground = true
        // Refresh is the UI's decision. No health read, permission, or payload here.
        notifyListeners("appResumed", JSObject())
    }
    override fun handleOnPause() { foreground = false; super.handleOnPause() }

    private fun launchCall(call: PluginCall, block: suspend () -> Unit) {
        scope.launch {
            if (!trusted(call)) return@launch
            callGenerations[call.callbackId] = generation
            try { block() }
            catch (cancelled: CancellationException) {
                call.reject("The app closed this health request.", "STALE_REQUEST")
                throw cancelled
            } catch (_: SecurityException) {
                if (callGenerations[call.callbackId] != generation) call.reject("The request was superseded.", "STALE_REQUEST")
                else {
                    // Foreground-only reads can fail after the app backgrounds even with
                    // valid permission. A provider exception is not proof of revocation.
                    val currentGrant = try {
                        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
                            HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
                        else null
                    } catch (_: Exception) { null }
                    if (callGenerations[call.callbackId] != generation) call.reject("The request was superseded.", "STALE_REQUEST")
                    else if (currentGrant != null && !currentGrant.containsAll(readPermissions))
                        call.resolve(snapshot("permission-denied", reason = deniedReason()))
                    else call.resolve(snapshot("error", reason = "provider-error"))
                }
            } catch (_: Exception) {
                // Do not send provider errors, raw records, or identifiers to JS/logs.
                if (callGenerations[call.callbackId] != generation) call.reject("The request was superseded.", "STALE_REQUEST")
                else if (!preferences.getBoolean("enabled", false)) call.resolve(snapshot("not-connected"))
                else call.resolve(snapshot("error", reason = "provider-error"))
            } finally {
                callGenerations.remove(call.callbackId)
            }
        }
    }

    private fun trusted(call: PluginCall): Boolean {
        val uri = bridge.webView.url?.let(Uri::parse)
        if (uri?.scheme == "https" && uri.host == "localhost" && uri.port == -1) return true
        call.reject("Health steps is available only in the packaged app.", "UNTRUSTED_ORIGIN")
        return false
    }

    private fun current(call: PluginCall, requestGeneration: Long): Boolean {
        if (generation == requestGeneration) return true
        call.reject("The health steps request was superseded.", "STALE_REQUEST")
        return false
    }

    private fun clientOrResolve(call: PluginCall): HealthConnectClient? = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HealthConnectClient.getOrCreate(context)
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
            call.resolve(snapshot("unsupported", reason = "health-connect-update-required")); null
        }
        else -> { call.resolve(snapshot("unsupported", reason = "health-connect-unavailable")); null }
    }

    private fun deniedReason(): String? = if (preferences.getBoolean("hadReadPermission", false)) "permission-revoked" else null

    private fun snapshot(status: String, count: Long? = null, window: StepWindow? = null, reason: String? = null): JSObject {
        val now = Instant.now()
        val period = window ?: StepWindow(now, ZoneId.systemDefault())
        return JSObject().apply {
            put("schemaVersion", 1)
            put("status", status)
            put("count", count ?: JSONObject.NULL)
            put("localDate", period.date.toString())
            put("timeZone", period.zone.id)
            put("updatedAt", if (window == null) JSONObject.NULL else now.toString())
            put("source", "android-health-connect")
            put("partialDay", false)
            put("trackingSince", JSONObject.NULL)
            reason?.let { put("reason", it) }
        }
    }

    override fun handleOnDestroy() { generation++; scope.cancel(); super.handleOnDestroy() }

    companion object {
        private const val SAMSUNG_HEALTH_PACKAGE = "com.sec.android.app.shealth"
        private const val WEB_APP_URL = "https://warming-up-bapmunna.web.app/"
    }
}
