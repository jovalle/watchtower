package io.github.jovalle.watchtower.tv

import android.app.Application
import kotlinx.coroutines.launch

class WatchtowerApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        graph.appScope.launch { graph.session.start() }
    }
}
