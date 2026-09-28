package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.tv.material3.Button
import androidx.tv.material3.DrawerValue
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.NavigationDrawer
import androidx.tv.material3.Text
import androidx.tv.material3.darkColorScheme
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.auth.AuthState
import io.github.jovalle.watchtower.tv.catalog.ApiCatalogDataSource
import io.github.jovalle.watchtower.tv.catalog.DetailsRoute
import io.github.jovalle.watchtower.tv.catalog.HomeRoute
import io.github.jovalle.watchtower.tv.catalog.HomeScreen
import io.github.jovalle.watchtower.tv.catalog.LibraryRoute
import io.github.jovalle.watchtower.tv.catalog.LibraryScreen
import io.github.jovalle.watchtower.tv.catalog.ListsRoute
import io.github.jovalle.watchtower.tv.catalog.ListsScreen
import io.github.jovalle.watchtower.tv.catalog.LoadState
import io.github.jovalle.watchtower.tv.catalog.MediaDetailsScreen
import io.github.jovalle.watchtower.tv.catalog.NavigationViewModel
import io.github.jovalle.watchtower.tv.catalog.SearchRoute
import io.github.jovalle.watchtower.tv.catalog.SearchScreen
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.pairing.PairingScreen
import io.github.jovalle.watchtower.tv.pairing.ProfileChooser
import io.github.jovalle.watchtower.tv.pairing.ProfileGateController
import io.github.jovalle.watchtower.tv.pairing.ServerAddressScreen
import io.github.jovalle.watchtower.tv.platform.DeepLinkAction
import io.github.jovalle.watchtower.tv.platform.DeepLinkResolver
import io.github.jovalle.watchtower.tv.platform.DeepLinkResult
import io.github.jovalle.watchtower.tv.platform.AndroidWatchNextSink
import io.github.jovalle.watchtower.tv.platform.WatchNextManager
import io.github.jovalle.watchtower.tv.playback.PlayerScreen
import io.github.jovalle.watchtower.tv.rooms.CreateMedia
import io.github.jovalle.watchtower.tv.rooms.InviteParser
import io.github.jovalle.watchtower.tv.rooms.JoinRoomRoute
import io.github.jovalle.watchtower.tv.rooms.JoinRoomScreen
import io.github.jovalle.watchtower.tv.rooms.RoomLobbyRoute
import io.github.jovalle.watchtower.tv.rooms.RoomLobbyScreen
import io.github.jovalle.watchtower.tv.settings.SettingsRoute
import io.github.jovalle.watchtower.tv.settings.SettingsScreen
import kotlinx.coroutines.launch

private val WatchtowerColors = darkColorScheme(
    primary = Color(0xFFFDBE02),
    onPrimary = Color.Black,
    background = Color(0xFF0A0A0A),
    onBackground = Color(0xFFF6F6F6),
    surface = Color(0xFF171717),
    onSurface = Color(0xFFF6F6F6),
    error = Color(0xFFFF8A80),
)

@Composable
fun AppRoot(graph: AppGraph) {
    val auth by graph.session.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val watchNext = remember(context) { WatchNextManager(AndroidWatchNextSink(context.applicationContext)) }
    LaunchedEffect(graph, watchNext) {
        graph.session.identityChanges.collect { watchNext.identityChanged() }
    }
    MaterialTheme(colorScheme = WatchtowerColors) {
        when (val state = auth) {
            AuthState.Starting -> Splash()
            is AuthState.NeedsServer -> ServerAddressScreen(graph, state.lastAddress, state.message)
            is AuthState.ReadyToPair -> PairingScreen(graph, state.message)
            is AuthState.SignedIn -> {
                val me = state.me
                if (me == null) {
                    Splash()
                } else if (me.features.profiles) {
                    val gate = remember(state.session.deviceSessionId) { ProfileGateController(graph) }
                    if (gate.state.completed) MainExperience(graph, watchNext) else ProfileChooser(graph, gate)
                } else {
                    MainExperience(graph, watchNext)
                }
            }
        }
    }
}

@Composable
private fun Splash() {
    Box(Modifier.fillMaxSize().background(WatchtowerColors.background), contentAlignment = Alignment.Center) {
        Text(stringResource(R.string.app_name), color = WatchtowerColors.primary, fontSize = 42.sp)
    }
}

@Composable
private fun MainExperience(graph: AppGraph, watchNext: WatchNextManager) {
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    val data = remember(graph) { ApiCatalogDataSource(graph.api) }
    var notice by remember { mutableStateOf<String?>(null) }
    val navigation: NavigationViewModel = viewModel {
        NavigationViewModel(data, graph.session::current, graph.session.identityChanges)
    }
    val libraries by navigation.state.collectAsStateWithLifecycle()
    val backStack by navController.currentBackStackEntryAsState()
    val roomsEnabled = graph.session.currentMe()?.features?.rooms == true

    LaunchedEffect(graph) {
        graph.session.identityChanges.collect {
            navController.navigate(HomeRoute) { popUpTo(HomeRoute) { inclusive = true } }
        }
    }

    val deepLink by graph.deepLinks.collectAsStateWithLifecycle()
    LaunchedEffect(deepLink, graph.session.currentMe()?.profile?.userId) {
        val uri = deepLink ?: return@LaunchedEffect
        val machineId = graph.session.currentMe()?.server?.machineId ?: return@LaunchedEffect
        if (uri.host == "join") {
            val secret = InviteParser.parse(uri.toString())
            if (!roomsEnabled || secret == null) {
                notice = if (roomsEnabled) "This Watch Together invitation is invalid." else "Watch Together is unavailable for this profile."
                navController.navigate(HomeRoute)
            } else {
                try {
                    val room = graph.rooms.join(secret)
                    navController.navigate(RoomLobbyRoute(room.roomId))
                } catch (error: Exception) {
                    notice = error.message ?: "Could not join this room."
                    navController.navigate(HomeRoute)
                }
            }
        } else {
            when (val result = DeepLinkResolver.resolve(uri.toString(), machineId)) {
                is DeepLinkResult.Allowed -> when (result.link.action) {
                    DeepLinkAction.DETAILS -> navController.navigate(DetailsRoute(result.link.ratingKey))
                    DeepLinkAction.PLAY -> navController.navigate(PlayerRoute(result.link.ratingKey))
                }
                is DeepLinkResult.Rejected -> {
                    notice = result.message
                    navController.navigate(HomeRoute)
                }
            }
        }
        graph.consumeDeepLink(uri)
    }

    Box(Modifier.fillMaxSize()) {
        NavigationDrawer(
            drawerContent = { drawerValue ->
                NavigationRail(
                    expanded = drawerValue == DrawerValue.Open,
                    currentRoute = backStack?.destination?.route,
                    libraries = (libraries as? LoadState.Content)?.value.orEmpty(),
                    roomsEnabled = roomsEnabled,
                    navigate = { destination ->
                        notice = null
                        navController.navigate(destination) {
                            launchSingleTop = true
                            restoreState = true
                            popUpTo<HomeRoute> { saveState = true }
                        }
                    },
                )
            },
        ) {
            NavHost(navController = navController, startDestination = HomeRoute, modifier = Modifier.fillMaxSize()) {
            composable<HomeRoute> {
                HomeScreen(graph, data, watchNext, onDetails = { navController.navigate(DetailsRoute(it)) }, onPlay = { navController.navigate(it) })
            }
            composable<LibraryRoute> { entry ->
                LibraryScreen(graph, data, entry.toRoute(), onOpen = { navController.navigate(DetailsRoute(it)) })
            }
            composable<SearchRoute> {
                SearchScreen(graph, data, onOpen = { navController.navigate(DetailsRoute(it)) })
            }
            composable<ListsRoute> {
                ListsScreen(graph, data, onOpen = { navController.navigate(DetailsRoute(it)) })
            }
            composable<DetailsRoute> { entry ->
                MediaDetailsScreen(
                    graph,
                    data,
                    entry.toRoute(),
                    onOpen = { navController.navigate(DetailsRoute(it)) },
                    onPlay = { navController.navigate(it) },
                    onWatchTogether = if (roomsEnabled) {
                        { detail ->
                            val version = detail.versions.firstOrNull()
                            val part = version?.parts?.firstOrNull()
                            val ratingKey = detail.ratingKey
                            if (version != null && part != null && ratingKey != null) {
                                scope.launch {
                                    try {
                                        val identity = graph.session.current() ?: return@launch
                                        val preferences = graph.api.preferences(identity)
                                        val room = graph.rooms.create(
                                            CreateMedia(ratingKey, version.mediaId, part.partId),
                                            detail.viewOffsetMs ?: 0,
                                            preferences.autoPlayNextEpisode,
                                        )
                                        navController.navigate(RoomLobbyRoute(room.roomId))
                                    } catch (error: Exception) {
                                        notice = error.message ?: "Could not create a Watch Together room."
                                    }
                                }
                            }
                        }
                    } else null,
                )
            }
            composable<JoinRoomRoute> {
                JoinRoomScreen(graph) { roomId -> navController.navigate(RoomLobbyRoute(roomId)) }
            }
            composable<RoomLobbyRoute> {
                RoomLobbyScreen(
                    graph,
                    onPlay = { navController.navigate(it) },
                    onExit = { navController.popBackStack() },
                )
            }
            composable<SettingsRoute> { SettingsScreen(graph) }
            composable<PlayerRoute> { entry ->
                PlayerScreen(
                    graph = graph,
                    route = entry.toRoute(),
                    onExit = { navController.popBackStack() },
                    onOpenItem = { next ->
                        navController.navigate(next) { popUpTo<PlayerRoute> { inclusive = true } }
                    },
                )
            }
        }
        }
        notice?.let {
            Text(
                it,
                color = Color.White,
                modifier = Modifier.align(Alignment.TopCenter).background(Color(0xEE8B1A1A)).padding(14.dp),
            )
        }
    }
}

@Composable
internal fun NavigationRail(
    expanded: Boolean,
    currentRoute: String?,
    libraries: List<io.github.jovalle.watchtower.tv.api.LibrarySection>,
    roomsEnabled: Boolean,
    navigate: (Any) -> Unit,
) {
    Column(
        Modifier
            .fillMaxHeight()
            .width(if (expanded) 250.dp else 82.dp)
            .background(Color(0xF2111111))
            .padding(horizontal = 10.dp, vertical = 24.dp),
    ) {
        DrawerButton(stringResource(R.string.home), expanded, currentRoute?.contains("HomeRoute") == true) { navigate(HomeRoute) }
        libraries.forEach { library ->
            DrawerButton(library.title, expanded, currentRoute?.contains("LibraryRoute") == true) {
                navigate(LibraryRoute(library.sectionId, library.title))
            }
        }
        DrawerButton(stringResource(R.string.search), expanded, currentRoute?.contains("SearchRoute") == true) { navigate(SearchRoute) }
        DrawerButton(stringResource(R.string.my_lists), expanded, currentRoute?.contains("ListsRoute") == true) { navigate(ListsRoute) }
        if (roomsEnabled) {
            DrawerButton(stringResource(R.string.room_watch_together), expanded, currentRoute?.contains("JoinRoomRoute") == true) {
                navigate(JoinRoomRoute)
            }
        }
        DrawerButton(stringResource(R.string.settings), expanded, currentRoute?.contains("SettingsRoute") == true) { navigate(SettingsRoute) }
    }
}

@Composable
private fun DrawerButton(label: String, expanded: Boolean, selected: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.padding(vertical = 4.dp).width(if (expanded) 226.dp else 58.dp),
    ) {
        Text(if (expanded) label else label.take(1), maxLines = 1)
        if (selected && expanded) Text(" •")
    }
}
