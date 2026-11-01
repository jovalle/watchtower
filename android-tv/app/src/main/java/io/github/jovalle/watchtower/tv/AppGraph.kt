package io.github.jovalle.watchtower.tv

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import io.github.jovalle.watchtower.tv.api.HttpClients
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchtowerApi
import io.github.jovalle.watchtower.tv.auth.CredentialStore
import io.github.jovalle.watchtower.tv.auth.DeviceInfo
import io.github.jovalle.watchtower.tv.auth.SessionManager
import io.github.jovalle.watchtower.tv.rooms.RoomApi
import io.github.jovalle.watchtower.tv.rooms.RoomManager
import io.github.jovalle.watchtower.tv.settings.LocalPlaybackPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okio.Path.Companion.toOkioPath

/** Manual dependency container; one instance per process. */
class AppGraph(private val app: Application) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val device = DeviceInfo(
        name = deviceName(app),
        model = listOf(Build.MANUFACTURER, Build.MODEL).filter { it.isNotBlank() }.joinToString(" ").take(64).ifBlank { null },
        versionName = BuildConfig.VERSION_NAME,
        versionCode = BuildConfig.VERSION_CODE,
    )

    val http = HttpClients("android-tv/${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
    val api = WatchtowerApi(http)
    val session = SessionManager(
        api = api,
        store = CredentialStore(app),
        prefs = app.getSharedPreferences("watchtower", Context.MODE_PRIVATE),
        appScope = appScope,
        device = device,
        allowCleartext = BuildConfig.ALLOW_CLEARTEXT,
    )
    val rooms = RoomManager(
        transport = RoomApi(http),
        appScope = appScope,
        currentIdentity = session::current,
        roomsEnabled = { session.currentMe()?.features?.rooms == true },
        identityChanges = session.identityChanges,
        nowMs = SystemClock::elapsedRealtime,
    )

    private val _deepLinks = MutableStateFlow<Uri?>(null)

    val localPlaybackPrefs = LocalPlaybackPreferences(app)

    /** Latest unconsumed watchtower:// link; the UI resolves it only after sign-in and profile checks. */
    val deepLinks: StateFlow<Uri?> = _deepLinks.asStateFlow()

    fun acceptDeepLink(intent: Intent?) {
        val uri = intent?.takeIf { it.action == Intent.ACTION_VIEW }?.data ?: return
        if (uri.scheme == "watchtower" && uri.host in setOf("media", "join")) _deepLinks.value = uri
    }

    fun consumeDeepLink(uri: Uri) {
        _deepLinks.compareAndSet(uri, null)
    }

    private var imageLoader: Pair<SessionSnapshot, ImageLoader>? = null

    /** Image loader bound to one identity; its caches are discarded when the identity changes. */
    @Synchronized
    fun imageLoader(snapshot: SessionSnapshot): ImageLoader {
        imageLoader?.let { (owner, loader) -> if (owner == snapshot) return loader }
        imageLoader?.second?.shutdown()
        val client = http.forSession(snapshot)
        val loader = ImageLoader.Builder(app)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { client })) }
            .memoryCache { MemoryCache.Builder().maxSizePercent(app, 0.15).build() }
            .diskCache {
                DiskCache.Builder()
                    .directory(app.cacheDir.resolve("images/${snapshot.deviceSessionId}-${snapshot.identityVersion}").toOkioPath())
                    .maxSizeBytes(64L * 1024 * 1024)
                    .build()
            }
            .build()
        imageLoader = snapshot to loader
        return loader
    }

    init {
        appScope.launch {
            session.identityChanges.collect { change ->
                synchronized(this@AppGraph) {
                    if (imageLoader?.first != change.current) {
                        imageLoader?.second?.shutdown()
                        imageLoader = null
                    }
                }
                launch(Dispatchers.IO) {
                    val keep = change.current?.let { "${it.deviceSessionId}-${it.identityVersion}" }
                    app.cacheDir.resolve("images").listFiles()?.filter { it.name != keep }?.forEach { it.deleteRecursively() }
                }
            }
        }
    }

    private companion object {
        fun deviceName(context: Context): String =
            (Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) ?: Build.MODEL ?: "Android TV")
                .trim().take(64).ifBlank { "Android TV" }
    }
}
