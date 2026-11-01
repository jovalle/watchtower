package io.github.jovalle.watchtower.tv.api

import java.io.IOException

/** A non-2xx Watchtower response. [message] is safe to show; it never contains credentials. */
class ApiException(
    val status: Int,
    val code: String,
    message: String,
    val retryable: Boolean,
    val retryAfterMs: Long?,
    val requestId: String?,
) : IOException(message) {
    val isAuthFailure: Boolean get() = status == 401
    val isIdentityMismatch: Boolean get() = status == 409 && code == "identity_version_mismatch"

    companion object {
        const val INCOMPATIBLE_SERVER = "incompatible_server"
    }
}
