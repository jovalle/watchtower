package io.github.jovalle.watchtower.tv.api

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response

const val IDENTITY_VERSION_HEADER = "X-Watchtower-Identity-Version"

/** Immutable authentication context captured when an operation starts. */
data class SessionSnapshot(
    val baseUrl: HttpUrl,
    val accessToken: String,
    val deviceSessionId: String,
    val identityVersion: Long,
    val expiresAtMs: Long,
) {
    fun resolve(pathOrUrl: String): HttpUrl =
        baseUrl.resolve(pathOrUrl)?.takeIf { ServerAddress.sameOrigin(it, baseUrl) }
            ?: throw IOException("Blocked a resource outside the paired Watchtower server.")

    override fun toString() = "SessionSnapshot(base=$baseUrl, device=$deviceSessionId, identityVersion=$identityVersion)"
}

/**
 * Attaches this snapshot's credentials to requests for its own origin and refuses every other origin,
 * so no Watchtower credential can reach a third party (redirects are disabled on the base client).
 */
class SessionHeaderInterceptor(private val snapshot: SessionSnapshot, private val sendIdentityVersion: Boolean = true) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!ServerAddress.sameOrigin(request.url, snapshot.baseUrl)) {
            throw IOException("Blocked a request outside the paired Watchtower server.")
        }
        val builder = request.newBuilder().header("Authorization", "Bearer ${snapshot.accessToken}")
        if (sendIdentityVersion && request.header(IDENTITY_VERSION_HEADER) == null) {
            builder.header(IDENTITY_VERSION_HEADER, snapshot.identityVersion.toString())
        }
        return chain.proceed(builder.build())
    }
}

/** Unauthenticated calls (instance metadata, pairing) may only go to the address the user entered. */
private class OriginOnlyInterceptor(private val origin: HttpUrl) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        if (!ServerAddress.sameOrigin(chain.request().url, origin)) {
            throw IOException("Blocked a request outside the Watchtower server.")
        }
        return chain.proceed(chain.request())
    }
}

class HttpClients(userAgent: String) {
    /** Shared connection pool and dispatcher. Never used directly for credentialed requests. */
    val base: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("X-Watchtower-Client", userAgent).build()) }
        .build()

    fun anonymous(origin: HttpUrl): OkHttpClient = base.newBuilder().addInterceptor(OriginOnlyInterceptor(origin)).build()

    /** Client for API calls, Media3 data sources and images under one captured identity. */
    fun forSession(snapshot: SessionSnapshot, sendIdentityVersion: Boolean = true): OkHttpClient =
        base.newBuilder().addInterceptor(SessionHeaderInterceptor(snapshot, sendIdentityVersion)).build()

    /** Long-lived streams (SSE) must not hit the read timeout between events. */
    fun streaming(snapshot: SessionSnapshot): OkHttpClient =
        forSession(snapshot).newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
}

/** Suspends until the call completes; cancelling the coroutine cancels the HTTP call. */
suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            continuation.resume(response) { _, value, _ -> value.close() }
        }

        override fun onFailure(call: Call, e: IOException) {
            if (!continuation.isCancelled) continuation.resumeWithException(e)
        }
    })
}
