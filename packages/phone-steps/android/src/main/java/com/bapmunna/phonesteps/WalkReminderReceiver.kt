package com.bapmunna.phonesteps

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.time.Instant
import java.time.ZoneId
import org.json.JSONArray

/** Only displays previously opted-in reminders; never reads health or the network. */
class WalkReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == WalkingReminders.ACTION) WalkingReminders.deliver(context, intent.getIntExtra("slot", -1))
        else if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED)) WalkingReminders.schedule(context)
    }
}

internal object WalkingReminders {
    const val ACTION = "com.bapmunna.phonesteps.WALK_REMINDER"
    private const val CHANNEL = "bapmunna-walking-v1"
    private const val FIRST_ID = 28400
    private fun prefs(context: Context) = context.getSharedPreferences("bapmunna_walk_reminders", Context.MODE_PRIVATE)
    private fun times(context: Context): List<String> = try {
        val saved = JSONArray(prefs(context).getString("times", "[]"))
        (0 until saved.length()).map { saved.getString(it) }.filter { WalkReminderTime.valid(it) }.distinct().take(4)
    } catch (_: Exception) { emptyList() }
    fun permission(context: Context): String {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return "denied"
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return "denied"
        val channel = context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL)
        return if (channel?.importance == NotificationManager.IMPORTANCE_NONE) "denied" else "granted"
    }
    fun status(context: Context) = JSObject().apply {
        // Preserve the user's scheduling choice separately from the OS permission.
        // A revoked permission must not hide the button that cancels this schedule.
        put("enabled", prefs(context).getBoolean("enabled", false))
        put("times", JSArray(times(context)))
        put("bloodSugarReminder", prefs(context).getBoolean("bloodSugarReminder", false))
        put("permission", permission(context))
    }
    fun configure(context: Context, enabled: Boolean, values: List<String>, glucose: Boolean): JSObject {
        if (enabled && (values.isEmpty() || values.size > 4 || values.distinct().size != values.size || values.any { !WalkReminderTime.valid(it) })) throw WalkingFailure("invalid_reminder_times")
        cancel(context)
        val allowed = enabled && permission(context) == "granted"
        if (!prefs(context).edit().putBoolean("enabled", allowed).putString("times", JSONArray(if (allowed) values.sorted() else emptyList<String>()).toString()).putBoolean("bloodSugarReminder", allowed && glucose).commit()) throw WalkingFailure("reminder_storage")
        if (allowed) schedule(context)
        return status(context)
    }
    private fun alarm(context: Context, slot: Int): PendingIntent = PendingIntent.getBroadcast(context, FIRST_ID + slot,
        Intent(context, WalkReminderReceiver::class.java).setAction(ACTION).putExtra("slot", slot), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun cancel(context: Context, clearDelivered: Boolean = true) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val notifications = NotificationManagerCompat.from(context)
        for (slot in 0..3) { alarms.cancel(alarm(context, slot)); if (clearDelivered) notifications.cancel(FIRST_ID + slot) }
    }
    fun schedule(context: Context) {
        cancel(context, false)
        if (!prefs(context).getBoolean("enabled", false) || permission(context) != "granted") return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "식사 후 산책 안내", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "직접 정한 시각의 가벼운 산책 안내"; lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        })
        for ((slot, time) in times(context).withIndex()) {
            scheduleSlot(context, slot, time)
        }
    }
    private fun scheduleSlot(context: Context, slot: Int, time: String) {
        // Inexact intentionally: no exact-alarm permission or medical timing promise.
        context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,
            WalkReminderTime.next(time, Instant.now(), ZoneId.systemDefault()).toEpochMilli(), alarm(context, slot))
    }
    fun deliver(context: Context, slot: Int) {
        if (slot !in times(context).indices || !prefs(context).getBoolean("enabled", false) || permission(context) != "granted") return
        val body = "식사를 마치셨다면, 몸이 편할 때 가볍게 걸어볼까요?" +
            if (prefs(context).getBoolean("bloodSugarReminder", false)) " 혈당을 재는 분은 안내받은 측정 시각도 확인해 주세요." else ""
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pending = launch?.let { PendingIntent.getActivity(context, FIRST_ID, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
        val notification = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("밥뭇나 · 가벼운 산책 시간").setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(pending).build()
        try { NotificationManagerCompat.from(context).notify(FIRST_ID + slot, notification) } catch (_: SecurityException) {}
        // Keep other due alarms intact if the OS delivers several late together.
        times(context).getOrNull(slot)?.let { scheduleSlot(context, slot, it) }
    }
}
