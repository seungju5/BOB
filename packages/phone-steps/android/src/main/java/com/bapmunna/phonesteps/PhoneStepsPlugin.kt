package com.bapmunna.phonesteps

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
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Reads Samsung Health records from Health Connect; never records or writes steps. */
@CapacitorPlugin(name = "PhoneSteps")
class PhoneStepsPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val readPermissions = setOf(HealthPermission.getReadPermission(StepsRecord::class))
    private val permissionContract = PermissionController.createRequestPermissionResultContract()
    private var generation = 0L
    private var pendingPermission: Pair<String, Long>? = null
    private val callGenerations = mutableMapOf<String, Long>()
    private lateinit var preferences: SharedPreferences

    override fun load() {
        preferences = context.getSharedPreferences("bapmunna_health_steps", Context.MODE_PRIVATE)
    }

    @PluginMethod fun status(call: PluginCall) = launchCall(call) { read(call, generation) }
    @PluginMethod fun readToday(call: PluginCall) = launchCall(call) { read(call, generation) }

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

    companion object { private const val SAMSUNG_HEALTH_PACKAGE = "com.sec.android.app.shealth" }
}
