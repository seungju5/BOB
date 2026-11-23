package com.bapmunna.phonesteps

import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject

/** Bound and sanitize the optional response before any server data enters JS. */
internal object HeartsPayload {
    const val MAX_RESPONSE_BYTES = 5 * 1024 * 1024
    val nonRevokingErrors = setOf("heart_consent_required", "heart_paused", "heart_league_consent_required", "heart_message_locked")
    private val wrapperKeys = setOf("enabled", "joined", "state", "summary", "messages", "leagueEnabled", "region", "updatedAt", "tier", "lastPromotionWeek")
    private val leagueKeys = setOf("enabled", "week", "weekEnd", "practice", "region", "group", "total", "entries", "me", "updatedAt")
    private val privateKeys = setOf("token", "accesstoken", "refreshtoken", "authorization", "secret", "clientsecret", "password", "email", "uid", "owneruid", "devicekey", "generation", "authtime", "prototype", "proto", "constructor")

    fun clean(action: String, value: JSONObject): JSObject {
        val allowed = when (action) {
            "heartleave" -> {
                if (value.opt("ok") != true) throw WalkingFailure("invalid_response")
                return JSObject().put("ok", true)
            }
            "heartleague" -> {
                if (value.opt("enabled") !is Boolean || value.opt("week") !is String || value.optJSONArray("entries") == null) throw WalkingFailure("invalid_response")
                leagueKeys
            }
            else -> {
                if (value.opt("enabled") !is Boolean || value.opt("joined") !is Boolean) throw WalkingFailure("invalid_response")
                if (value.optBoolean("enabled") && (value.optJSONObject("state") == null || value.optJSONObject("summary") == null)) throw WalkingFailure("invalid_response")
                wrapperKeys
            }
        }
        var remaining = 20_000
        fun safe(input: Any?, depth: Int): Any {
            if (--remaining < 0 || depth > 16) throw WalkingFailure("invalid_response")
            return when (input) {
                null, JSONObject.NULL -> JSONObject.NULL
                is JSONObject -> JSONObject().also { target ->
                    for (key in input.keys()) {
                        val canonical = key.lowercase().replace(Regex("[^a-z0-9]"), "")
                        if (key.length <= 128 && canonical !in privateKeys && !canonical.endsWith("token") && !canonical.endsWith("secret")) target.put(key, safe(input.opt(key), depth + 1))
                    }
                }
                is JSONArray -> JSONArray().also { target ->
                    if (input.length() > 1000) throw WalkingFailure("invalid_response")
                    for (index in 0 until input.length()) target.put(safe(input.opt(index), depth + 1))
                }
                is String -> input.also { if (it.length > 230_000) throw WalkingFailure("invalid_response") }
                is Boolean -> input
                is Number -> input.also { if (!it.toDouble().isFinite()) throw WalkingFailure("invalid_response") }
                else -> throw WalkingFailure("invalid_response")
            }
        }
        val selected = JSONObject()
        for (key in allowed) if (value.has(key)) selected.put(key, value.opt(key))
        return JSObject(safe(selected, 0).toString())
    }
}
