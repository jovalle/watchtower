package io.github.jovalle.watchtower.tv.api

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Validates a user-entered Watchtower address and reduces it to an origin (scheme://host[:port]/). */
object ServerAddress {
    sealed interface Result {
        data class Valid(val baseUrl: HttpUrl) : Result
        data class Invalid(val reason: String) : Result
    }

    fun parse(input: String, allowCleartext: Boolean): Result {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return Result.Invalid("Enter your Watchtower address.")
        val withScheme = if ("://" in trimmed) trimmed else "https://$trimmed"
        val url = withScheme.toHttpUrlOrNull() ?: return Result.Invalid("That address isn't valid.")
        if (url.username.isNotEmpty() || url.password.isNotEmpty()) {
            return Result.Invalid("Remove the user name or password from the address.")
        }
        if (url.scheme == "http" && !allowCleartext) {
            return Result.Invalid("Use an https:// address. Unencrypted connections are only allowed in debug builds.")
        }
        if (url.encodedPath != "/" || url.query != null || url.fragment != null) {
            return Result.Invalid("Enter only the server address, without a path.")
        }
        return Result.Valid(url.newBuilder().encodedPath("/").build())
    }

    fun sameOrigin(a: HttpUrl, b: HttpUrl): Boolean = a.scheme == b.scheme && a.host == b.host && a.port == b.port
}
