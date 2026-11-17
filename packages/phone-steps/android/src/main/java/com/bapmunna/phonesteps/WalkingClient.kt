package com.bapmunna.phonesteps

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.JSObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.time.Instant
import java.time.ZoneId
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** No secret leaves this native class. The host disables Android backup. */
internal class WalkingClient(context: Context) {
    private val prefs = context.getSharedPreferences("bapmunna_walking_private", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    @Volatile var revision = 0L; private set
    private val alias = "bapmunna.walking.device.v1"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
            generateKey()
        }
    }
    private fun save(value: JSONObject?) {
        if (value == null) { if (!prefs.edit().clear().commit()) throw WalkingFailure("secure_storage"); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()); updateAAD(alias.toByteArray()) }
        val encrypted = cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8))
        val record = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP)
        if (!prefs.edit().putString("encrypted", record).commit()) throw WalkingFailure("secure_storage")
    }
    private fun load(): JSONObject? {
        val record = prefs.getString("encrypted", null) ?: return null
        return try {
            val parts = record.split('.')
            if (parts.size != 2) throw WalkingFailure("secure_storage")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
                updateAAD(alias.toByteArray())
            }
            JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)).also {
                if (!it.optString("token").matches(Regex("^walk_[A-Za-z0-9_-]{43}$"))) throw WalkingFailure("secure_storage")
                if (Instant.parse(it.getString("expiresAt")).isBefore(Instant.now()) && !it.optBoolean("revokePending")) { save(null); return null }
            }
        } catch (_: Exception) { throw WalkingFailure("secure_storage") }
    }
    private fun visible(value: JSONObject?): JSObject = JSObject().apply {
        put("linked", value != null && !value.optBoolean("revokePending"))
        put("confirmed", value?.optBoolean("confirmed") == true && !value.optBoolean("revokePending"))
        put("revokePending", value?.optBoolean("revokePending") == true)
        if (value != null) { put("nickname", value.optString("nickname")); put("publicId", value.optString("publicId")); put("expiresAt", value.optString("expiresAt")) }
    }
    suspend fun status(): JSObject = mutex.withLock { visible(load()) }
    suspend fun link(code: String): JSObject = mutex.withLock {
        if (!code.matches(Regex("^[0-9]{8}$"))) throw WalkingFailure("invalid_code")
        if (load() != null) throw WalkingFailure("disconnect_first")
        ++revision
        val expected = revision
        val result = request("pair", JSONObject().put("code", code))
        if (!result.optString("token").matches(Regex("^walk_[A-Za-z0-9_-]{43}$")) || result.optBoolean("confirmed", true)) throw WalkingFailure("invalid_response")
        val expires = Instant.parse(result.getString("expiresAt"))
        if (!expires.isAfter(Instant.now()) || result.optString("nickname").isBlank() || result.optString("publicId").isBlank()) throw WalkingFailure("invalid_response")
        val record = JSONObject().put("token", result.getString("token")).put("nickname", result.getString("nickname"))
            .put("publicId", result.getString("publicId")).put("expiresAt", expires.toString()).put("confirmed", false).put("revokePending", false)
        if (expected != revision) { try { request("unpair", JSONObject(), record.getString("token")) } catch (_: Exception) {} ; throw WalkingFailure("stale_request") }
        try { save(record) } catch (error: Exception) { try { request("unpair", JSONObject(), record.getString("token")) } catch (_: Exception) {} ; throw error }
        visible(record)
    }
    suspend fun confirm(consentVersion: String, share: Boolean): JSObject = mutex.withLock {
        if (consentVersion != "2026-11-17" || !share) throw WalkingFailure("consent_required")
        val saved = requireSession(false)
        val expected = revision
        val result = authenticated("confirm", JSONObject().put("consentVersion", consentVersion).put("shareTodaySteps", true), saved)
        if (expected != revision) throw WalkingFailure("stale_request")
        if (!result.optBoolean("ok") || !result.optBoolean("confirmed") || result.optString("publicId") != saved.optString("publicId") || result.optString("nickname") != saved.optString("nickname")) throw WalkingFailure("invalid_response")
        val expiry = Instant.parse(result.getString("expiresAt"))
        if (!expiry.isAfter(Instant.now())) throw WalkingFailure("invalid_response")
        saved.put("confirmed", true).put("expiresAt", expiry.toString()); save(saved); ++revision
        visible(saved)
    }
    private fun requireSession(confirmed: Boolean = true): JSONObject {
        val value = load() ?: throw WalkingFailure("device_expired")
        if (value.optBoolean("revokePending")) throw WalkingFailure("revocation_pending")
        if (confirmed && !value.optBoolean("confirmed")) throw WalkingFailure("device_confirmation_required")
        return value
    }
    suspend fun isReady(): Boolean = mutex.withLock { val value = load(); value != null && value.optBoolean("confirmed") && !value.optBoolean("revokePending") }
    suspend fun sync(snapshot: JSObject, expected: Long, healthPermitted: suspend () -> Boolean, stillCurrent: () -> Boolean): JSObject = mutex.withLock {
        if (expected != revision) throw WalkingFailure("stale_request")
        val saved = requireSession()
        if (snapshot.optString("status") != "ready" || snapshot.optString("timeZone") != "Asia/Seoul" || snapshot.isNull("count")) return@withLock JSObject().put("ok", false).put("reason", snapshot.optString("status", "no-data"))
        val body = JSONObject().put("date", snapshot.getString("localDate")).put("count", snapshot.getLong("count"))
            .put("source", "android-health-connect").put("queriedAt", snapshot.getString("queriedAt")).put("timeZone", "Asia/Seoul")
        if (!healthPermitted() || expected != revision || !stillCurrent()) throw WalkingFailure("stale_request")
        val result = authenticated("sync", body, saved, { expected == revision && stillCurrent() })
        if (expected != revision || !stillCurrent()) throw WalkingFailure("stale_request")
        if (result.opt("ok") != true || result.opt("date") != body.getString("date") || integer(result, "count") != body.getLong("count") || !validTime(result.opt("syncedAt"))) throw WalkingFailure("invalid_response")
        JSObject().put("ok", true).put("date", result.getString("date"))
            .put("count", result.getLong("count")).put("syncedAt", result.getString("syncedAt"))
    }
    suspend fun board(): JSObject = mutex.withLock { cleanBoard(authenticated("board", null, requireSession())) }
    suspend fun disconnect() {
        ++revision // Stop an outstanding health read before it can submit.
        // Persist before waiting for an in-flight network operation. Process death
        // during an offline revoke must not allow uploads on the next launch.
        val pending = load() ?: return
        pending.put("revokePending", true); save(pending)
        mutex.withLock {
            val saved = load() ?: return@withLock
            if (saved.optString("token") != pending.getString("token")) return@withLock
            try { val result = request("unpair", JSONObject(), saved.getString("token")); if (result.opt("ok") != true) throw WalkingFailure("invalid_response"); save(null) }
            catch (error: WalkingFailure) { if (error.status == 401) save(null) else throw error }
        }
    }
    private fun validTime(value: Any?): Boolean = value is String && try { Instant.parse(value); true } catch (_: Exception) { false }
    private fun integer(value: JSONObject, key: String): Long? {
        val number = value.opt(key)
        if (number !is Int && number !is Long) return null
        return (number as Number).toLong().takeIf { it in 0..9_007_199_254_740_991L }
    }
    private fun cleanBoard(value: JSONObject): JSObject {
        val date = Instant.now().atZone(ZoneId.of("Asia/Seoul")).toLocalDate().toString()
        val entries = value.optJSONArray("entries") ?: throw WalkingFailure("invalid_response")
        val me = value.optJSONObject("me") ?: throw WalkingFailure("invalid_response")
        val total = integer(value, "total") ?: throw WalkingFailure("invalid_response")
        if (value.opt("date") != date || value.opt("timeZone") != "Asia/Seoul" || !validTime(value.opt("updatedAt")) || entries.length() > 50) throw WalkingFailure("invalid_response")
        fun row(input: JSONObject, own: Boolean): JSONObject {
            val id = input.opt("publicId") as? String ?: throw WalkingFailure("invalid_response")
            val nickname = input.opt("nickname") as? String ?: throw WalkingFailure("invalid_response")
            if (id.isBlank() || id.length > 100 || nickname.isBlank() || nickname.length > 30) throw WalkingFailure("invalid_response")
            val count = integer(input, "count"); val rank = integer(input, "rank")
            if ((count == null && !(own && input.opt("count") == JSONObject.NULL)) || ((rank == null || rank < 1) && !(own && input.opt("rank") == JSONObject.NULL))) throw WalkingFailure("invalid_response")
            val result = JSONObject().put("publicId", id).put("nickname", nickname).put("count", count ?: JSONObject.NULL).put("rank", rank ?: JSONObject.NULL)
            if (own) {
                val synced = input.opt("lastSyncedAt")
                if (synced != JSONObject.NULL && !validTime(synced)) throw WalkingFailure("invalid_response")
                result.put("lastSyncedAt", synced)
            }
            return result
        }
        val cleanEntries = org.json.JSONArray()
        for (index in 0 until entries.length()) cleanEntries.put(row(entries.optJSONObject(index) ?: throw WalkingFailure("invalid_response"), false))
        return JSObject().put("date", date).put("timeZone", "Asia/Seoul").put("updatedAt", value.getString("updatedAt"))
            .put("entries", cleanEntries).put("me", row(me, true)).put("total", total).put("limit", 50)
    }
    private suspend fun authenticated(path: String, body: JSONObject?, saved: JSONObject, allowed: () -> Boolean = { true }): JSONObject {
        try { return request(path, body, saved.getString("token"), allowed) }
        catch (error: WalkingFailure) {
            if ((error.status == 401 || error.status == 403) && error.code != "device_confirmation_required") { save(null); ++revision }
            throw error
        }
    }
    private suspend fun request(path: String, body: JSONObject? = null, token: String? = null, allowed: () -> Boolean = { true }): JSONObject = withContext(Dispatchers.IO) {
        if (path !in setOf("pair", "confirm", "sync", "board", "unpair")) throw WalkingFailure("invalid_request")
        val connection = URL("https://bapmunna-smartthings.vercel.app/api/walking/$path").openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 10000; connection.readTimeout = 10000
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.setRequestProperty("Origin", "https://localhost")
            connection.setRequestProperty("Accept", "application/json")
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                if (!allowed()) throw WalkingFailure("stale_request")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { input ->
                val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(4096)
                while (output.size() <= 65536) { val length = input.read(buffer); if (length < 0) break; output.write(buffer, 0, length) }
                output.toByteArray()
            } ?: ByteArray(0)
            if (bytes.size > 65536) throw WalkingFailure("invalid_response")
            val result = try { JSONObject(String(bytes, Charsets.UTF_8)) } catch (_: Exception) { JSONObject() }
            if (status !in 200..299) {
                val code = result.optString("error").takeIf { it.matches(Regex("^[a-z_]{1,64}$")) } ?: "server_error"
                throw WalkingFailure(code, status)
            }
            result
        } catch (error: WalkingFailure) { throw error }
        catch (_: Exception) { throw WalkingFailure("network_error") }
        finally { connection.disconnect() }
    }
}

internal class WalkingFailure(val code: String, val status: Int = 0) : Exception(code)
