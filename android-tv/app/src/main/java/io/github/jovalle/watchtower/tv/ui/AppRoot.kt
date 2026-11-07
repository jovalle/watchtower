package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.focus.FocusDirection
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Border
import androidx.tv.material3.Icon
import androidx.tv.material3.DrawerValue
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.ModalNavigationDrawer
import androidx.tv.material3.rememberDrawerState
import androidx.tv.material3.Text
import androidx.tv.material3.Typography
import androidx.tv.material3.darkColorScheme
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.auth.AuthState
import io.github.jovalle.watchtower.tv.catalog.ApiCatalogDataSource
import io.github.jovalle.watchtower.tv.catalog.CollectionRoute
import io.github.jovalle.watchtower.tv.catalog.CollectionScreen
import io.github.jovalle.watchtower.tv.catalog.CollectionsRoute
import io.github.jovalle.watchtower.tv.catalog.CollectionsScreen
import io.github.jovalle.watchtower.tv.catalog.DetailsRoute
import io.github.jovalle.watchtower.tv.catalog.ExternalDetailsRoute
import io.github.jovalle.watchtower.tv.catalog.ExternalDetailsScreen
import io.github.jovalle.watchtower.tv.catalog.HomeRoute
import io.github.jovalle.watchtower.tv.catalog.HomeScreen
import io.github.jovalle.watchtower.tv.catalog.LibraryRoute
import io.github.jovalle.watchtower.tv.catalog.LibraryScreen
import io.github.jovalle.watchtower.tv.catalog.ListsRoute
import io.github.jovalle.watchtower.tv.catalog.ListsScreen
import io.github.jovalle.watchtower.tv.catalog.LoadState
import io.github.jovalle.watchtower.tv.catalog.MediaDetailsScreen
import io.github.jovalle.watchtower.tv.catalog.PersonRoute
import io.github.jovalle.watchtower.tv.catalog.PersonProfileScreen
import io.github.jovalle.watchtower.tv.catalog.NavigationViewModel
import io.github.jovalle.watchtower.tv.catalog.SearchRoute
import io.github.jovalle.watchtower.tv.catalog.SearchScreen
import io.github.jovalle.watchtower.tv.catalog.PlaylistRoute
import io.github.jovalle.watchtower.tv.catalog.PlaylistScreen
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
import io.github.jovalle.watchtower.tv.settings.SettingsRoute
import io.github.jovalle.watchtower.tv.settings.SettingsScreen
import io.github.jovalle.watchtower.tv.services.RequestsRoute
import io.github.jovalle.watchtower.tv.services.IssuesRoute
import io.github.jovalle.watchtower.tv.services.IssueDetailRoute
import io.github.jovalle.watchtower.tv.services.RequestsScreen
import io.github.jovalle.watchtower.tv.services.IssuesScreen
import io.github.jovalle.watchtower.tv.services.IssueDetailScreen

private val WatchtowerColors = darkColorScheme(
    primary = Color(0xFFFDBE02),
    onPrimary = Color.Black,
    background = Color(0xFF101113),
    onBackground = Color(0xFFF6F6F6),
    surface = Color(0xFF242527),
    onSurface = Color(0xFFF6F6F6),
    error = Color(0xFFFF8A80),
)

private val WatchtowerFont = FontFamily(
    listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold).map { weight ->
        Font(R.font.inter, weight = weight, variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)))
    },
)
private val WatchtowerTypography = Typography().let { type ->
    type.copy(
        displayLarge = type.displayLarge.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        displayMedium = type.displayMedium.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        displaySmall = type.displaySmall.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        headlineLarge = type.headlineLarge.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        headlineMedium = type.headlineMedium.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        headlineSmall = type.headlineSmall.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        titleLarge = type.titleLarge.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        titleMedium = type.titleMedium.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        titleSmall = type.titleSmall.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        bodyLarge = type.bodyLarge.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        bodyMedium = type.bodyMedium.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        bodySmall = type.bodySmall.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        labelLarge = type.labelLarge.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        labelMedium = type.labelMedium.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
        labelSmall = type.labelSmall.copy(fontFamily = WatchtowerFont, letterSpacing = 0.sp),
    )
}

@Composable
fun AppRoot(graph: AppGraph) {
    val auth by graph.session.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val watchNext = remember(context) { WatchNextManager(AndroidWatchNextSink(context.applicationContext)) }
    LaunchedEffect(graph, watchNext) {
        graph.session.identityChanges.collect { watchNext.identityChanged() }
    }
    MaterialTheme(colorScheme = WatchtowerColors, typography = WatchtowerTypography) {
        CompositionLocalProvider(LocalContentColor provides WatchtowerColors.onBackground) {
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
}

@Composable
private fun Splash() {
    Box(Modifier.fillMaxSize().background(WatchtowerColors.background), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.watchtower_wordmark), stringResource(R.string.app_name),
            modifier = Modifier.width(300.dp).aspectRatio(376f / 86f))
    }
}

@Composable
private fun MainExperience(graph: AppGraph, watchNext: WatchNextManager) {
    val navController = rememberNavController()
    val data = remember(graph) { ApiCatalogDataSource(graph.api) }
    var notice by remember { mutableStateOf<String?>(null) }
    val navigation: NavigationViewModel = viewModel {
        NavigationViewModel(data, graph.session::current, graph.session.identityChanges)
    }
    val libraries by navigation.state.collectAsStateWithLifecycle()
    val backStack by navController.currentBackStackEntryAsState()
    var selectedLibraryId by rememberSaveable { mutableStateOf<String?>(null) }
    val activeLibraryId = backStack?.let { entry ->
        when {
            entry.destination.hasRoute<LibraryRoute>() -> entry.toRoute<LibraryRoute>().sectionId
            entry.destination.hasRoute<CollectionsRoute>() -> entry.toRoute<CollectionsRoute>().sectionId
            else -> null
        }
    }
    var rememberedSource by rememberSaveable { mutableStateOf("HomeRoute") }
    val source = backStack?.destination?.let { destination ->
        when {
            destination.hasRoute<HomeRoute>() -> "HomeRoute"
            destination.hasRoute<LibraryRoute>() || destination.hasRoute<CollectionsRoute>() || destination.hasRoute<CollectionRoute>() -> "LibraryRoute"
            destination.hasRoute<SearchRoute>() -> "SearchRoute"
            destination.hasRoute<ListsRoute>() || destination.hasRoute<PlaylistRoute>() -> "ListsRoute"
            destination.hasRoute<RequestsRoute>() -> "RequestsRoute"
            destination.hasRoute<IssuesRoute>() || destination.hasRoute<IssueDetailRoute>() -> "IssuesRoute"
            destination.hasRoute<SettingsRoute>() -> "SettingsRoute"
            else -> null
        }
    }
    LaunchedEffect(source, activeLibraryId) {
        if (source != null) rememberedSource = source
        if (activeLibraryId != null) selectedLibraryId = activeLibraryId
        else if (source != null && source != "LibraryRoute") selectedLibraryId = null
    }
    val visibleSource = source ?: rememberedSource
    LaunchedEffect(graph) {
        graph.session.identityChanges.collect {
            navController.navigate(HomeRoute) { popUpTo(HomeRoute) { inclusive = true } }
        }
    }

    val deepLink by graph.deepLinks.collectAsStateWithLifecycle()
    LaunchedEffect(deepLink, graph.session.currentMe()?.profile?.userId) {
        val uri = deepLink ?: return@LaunchedEffect
        val machineId = graph.session.currentMe()?.server?.machineId ?: return@LaunchedEffect
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
        graph.consumeDeepLink(uri)
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val focusManager = LocalFocusManager.current
    val inSettings = backStack?.destination?.hasRoute<SettingsRoute>() == true
    BackHandler(drawerState.currentValue == DrawerValue.Open && !inSettings) {
        drawerState.setValue(DrawerValue.Closed)
        focusManager.moveFocus(FocusDirection.Right)
    }
    Box(Modifier.fillMaxSize()) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            scrimBrush = SolidColor(Color.Black.copy(alpha = 0.65f)),
            drawerContent = { drawerValue ->
                if (backStack?.destination?.hasRoute<PlayerRoute>() != true) {
                    NavigationRail(
                        expanded = drawerValue == DrawerValue.Open || inSettings,
                        currentRoute = visibleSource,
                        libraries = (libraries as? LoadState.Content)?.value.orEmpty(),
                        currentLibraryId = (activeLibraryId ?: selectedLibraryId).takeIf { visibleSource == "LibraryRoute" },
                        onExpand = { drawerState.setValue(DrawerValue.Open) },
                        navigate = { destination ->
                            notice = null
                            drawerState.setValue(DrawerValue.Closed)
                            selectedLibraryId = when (destination) {
                                is LibraryRoute -> destination.sectionId
                                is CollectionsRoute -> destination.sectionId
                                else -> null
                            }
                            navController.navigateFromRail(destination)
                        },
                    )
                }
            },
        ) {
            NavHost(navController = navController, startDestination = HomeRoute, modifier = Modifier.fillMaxSize()) {
            composable<HomeRoute> {
                HomeScreen(graph, data, watchNext,
                    onDetails = { navController.navigate(DetailsRoute(it)) },
                    onPlay = { navController.navigate(it) },
                    onExternalDetails = { item -> item.external?.let { external ->
                        navController.navigate(ExternalDetailsRoute(external.provider, external.id, external.type,
                            item.title, item.year, item.posterUrl, item.backdropUrl))
                    } },
                )
            }
            composable<LibraryRoute> { entry ->
                val route = entry.toRoute<LibraryRoute>()
                LibraryScreen(
                    graph,
                    data,
                    route,
                    onOpen = { navController.navigate(DetailsRoute(it)) },
                    onCollections = { navController.navigate(CollectionsRoute(route.sectionId, route.title)) },
                    onPlaylist = { navController.navigate(it) },
                )
            }
            composable<CollectionsRoute> { entry ->
                CollectionsScreen(graph, data, entry.toRoute()) { navController.navigate(it) }
            }
            composable<CollectionRoute> { entry ->
                CollectionScreen(graph, data, entry.toRoute(), onOpen = { navController.navigate(DetailsRoute(it)) })
            }
            composable<SearchRoute> {
                SearchScreen(graph, data) { item ->
                    val key = item.ratingKey
                    val external = item.external
                    when {
                        key != null -> navController.navigate(DetailsRoute(key))
                        external != null -> navController.navigate(
                            ExternalDetailsRoute(
                                external.provider,
                                external.id,
                                external.type,
                                item.title,
                                item.year,
                                item.posterUrl,
                                item.backdropUrl,
                            ),
                        )
                    }
                }
            }
            composable<ListsRoute> {
                ListsScreen(
                    graph,
                    data,
                    onOpen = { navController.navigate(DetailsRoute(it)) },
                    onPlaylist = { navController.navigate(it) },
                    onExternalDetails = { item -> item.external?.let { external ->
                        navController.navigate(ExternalDetailsRoute(external.provider, external.id, external.type,
                            item.title, item.year, item.posterUrl, item.backdropUrl))
                    } },
                )
            }
            composable<PlaylistRoute> { entry ->
                PlaylistScreen(
                    graph,
                    data,
                    entry.toRoute(),
                    onOpen = { navController.navigate(DetailsRoute(it)) },
                    onPlay = { navController.navigate(it) },
                )
            }
            composable<DetailsRoute> { entry ->
                MediaDetailsScreen(
                    graph,
                    data,
                    entry.toRoute(),
                    onOpen = { navController.navigate(DetailsRoute(it)) },
                    onPlay = { navController.navigate(it) },
                    onPerson = { navController.navigate(it) },
                )
            }
            composable<PersonRoute> { entry ->
                PersonProfileScreen(graph, data, entry.toRoute(), onOpen = { item ->
                    if (item.ratingKey != null) navController.navigate(DetailsRoute(item.ratingKey))
                    else item.external?.let { external ->
                        navController.navigate(ExternalDetailsRoute(external.provider, external.id, external.type,
                            item.title, item.year, item.posterUrl, item.backdropUrl))
                    }
                }, onBack = { navController.popBackStack() })
            }
            composable<ExternalDetailsRoute> { entry ->
                ExternalDetailsScreen(graph, data, entry.toRoute(),
                    onOpenLocal = { navController.navigate(DetailsRoute(it)) }, onBack = { navController.popBackStack() })
            }
            composable<RequestsRoute> {
                RequestsScreen(graph,
                    onOpen = { navController.navigate(it) },
                    onOpenLocal = { navController.navigate(DetailsRoute(it)) },
                    onSettings = { navController.navigate(SettingsRoute) },
                )
            }
            composable<IssuesRoute> {
                IssuesScreen(graph,
                    onIssue = { navController.navigate(IssueDetailRoute(it)) },
                    onSettings = { navController.navigate(SettingsRoute) },
                )
            }
            composable<IssueDetailRoute> { entry ->
                IssueDetailScreen(graph, entry.toRoute<IssueDetailRoute>().id,
                    onOpen = { navController.navigate(it) },
                    onOpenLocal = { navController.navigate(DetailsRoute(it)) },
                    onBack = { navController.popBackStack() },
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
        if (backStack?.destination?.hasRoute<PlayerRoute>() != true) {
            (libraries as? LoadState.Error)?.let { failure ->
                val retryFocus = remember { FocusRequester() }
                LaunchedEffect(failure.message) { retryFocus.requestFocus() }
                Column(Modifier.align(Alignment.BottomStart).padding(start = 64.dp, end = 32.dp, bottom = 24.dp)
                    .width(420.dp).background(WatchtowerColors.surface).padding(16.dp)) {
                    Text(failure.message, color = WatchtowerColors.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    TvAction(stringResource(R.string.retry), TvSymbol.Refresh, navigation::load, Modifier.focusRequester(retryFocus))
                }
            }
        }
    }
}

internal fun NavHostController.navigateFromRail(destination: Any) {
    navigate(destination) {
        launchSingleTop = true
        // Home opens its root; saved library stacks share one destination ID across sections.
        restoreState = destination != HomeRoute && destination !is LibraryRoute
        popUpTo<HomeRoute> { saveState = true }
    }
}

@Composable
internal fun NavigationRail(
    expanded: Boolean,
    currentRoute: String?,
    libraries: List<io.github.jovalle.watchtower.tv.api.LibrarySection>,
    navigate: (Any) -> Unit,
    currentLibraryId: String? = null,
    onExpand: (() -> Unit)? = null,
) {
    val brandSettingsLabel = stringResource(R.string.tv_brand_settings)
    val homeFocus = remember { FocusRequester() }
    val selectedFocus = remember { FocusRequester() }
    val isHome = currentRoute?.contains("HomeRoute") == true
    val selectedLibrary = libraries.firstOrNull { it.sectionId == currentLibraryId }
    val visibleLibraries = if (expanded) libraries else (libraries.take(2) + listOfNotNull(selectedLibrary)).distinctBy { it.sectionId }
    val hasSelection = selectedLibrary != null || currentRoute?.let { route ->
        listOf("HomeRoute", "SearchRoute", "ListsRoute", "RequestsRoute", "IssuesRoute", "IssueDetailRoute", "SettingsRoute").any(route::contains)
    } == true
    LaunchedEffect(expanded) {
        if (expanded) (if (hasSelection) selectedFocus else homeFocus).requestFocus()
    }
    Box(Modifier.fillMaxHeight().width(if (expanded) 232.dp else 56.dp)
        .then(if (expanded) Modifier.background(Brush.horizontalGradient(listOf(Color(0xFF101113), Color(0xFF101113), Color(0xF2101113)))) else Modifier)) {
        if (!expanded) {
            val openSettings = { navigate(SettingsRoute) }
            Button(
                onClick = openSettings,
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 20.dp).size(32.dp).pointerClick(onClick = openSettings),
                contentPadding = PaddingValues(4.dp),
                shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                colors = ButtonDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color(0xFF444444)),
                scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
            ) { Image(painterResource(R.drawable.watchtower_mark), stringResource(R.string.app_name), Modifier.size(24.dp)) }
        }
        Column(
            Modifier.align(if (expanded) Alignment.TopStart else Alignment.Center)
                .width(if (expanded) 232.dp else 56.dp)
                .then(if (expanded) Modifier.fillMaxHeight() else Modifier)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = if (expanded) 16.dp else 8.dp, vertical = if (expanded) 24.dp else 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (expanded) {
                val openSettings = { navigate(SettingsRoute) }
                Button(
                    onClick = openSettings,
                    modifier = Modifier.fillMaxWidth().height(48.dp).pointerClick(onClick = openSettings)
                        .semantics { contentDescription = brandSettingsLabel }
                        .then(if (currentRoute?.contains("SettingsRoute") == true) Modifier.focusRequester(selectedFocus) else Modifier),
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                    colors = ButtonDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color(0xFF444444)),
                    scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
                ) { Image(painterResource(R.drawable.watchtower_wordmark), null, Modifier.width(168.dp).height(36.dp)) }
                Spacer(Modifier.height(12.dp))
            }
            DrawerButton(stringResource(R.string.search), TvSymbol.Search, expanded, currentRoute?.contains("SearchRoute") == true,
                focus = if (expanded && currentRoute?.contains("SearchRoute") == true) selectedFocus else null) { navigate(SearchRoute) }
            DrawerButton(stringResource(R.string.home), TvSymbol.Home, expanded, isHome,
                focus = if (isHome && expanded) selectedFocus else homeFocus) { navigate(HomeRoute) }
            if (expanded) {
                Text(stringResource(R.string.tv_libraries), modifier = Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 4.dp),
                    fontSize = 10.sp, color = Color(0xFF9A9A9A))
            }
            visibleLibraries.forEach { library ->
                DrawerButton(library.title, if (library.type == "show") TvSymbol.Shows else TvSymbol.Movies,
                    expanded, currentLibraryId == library.sectionId,
                    focus = if (expanded && currentLibraryId == library.sectionId) selectedFocus else null) {
                    navigate(LibraryRoute(library.sectionId, library.title))
                }
            }
            if (expanded) Spacer(Modifier.height(8.dp))
            DrawerButton(stringResource(R.string.my_lists), TvSymbol.Bookmark, expanded, currentRoute?.contains("ListsRoute") == true,
                focus = if (expanded && currentRoute?.contains("ListsRoute") == true) selectedFocus else null) { navigate(ListsRoute) }
            DrawerButton(stringResource(R.string.tv_requests), TvSymbol.Requests, expanded, currentRoute?.contains("RequestsRoute") == true,
                focus = if (expanded && currentRoute?.contains("RequestsRoute") == true) selectedFocus else null) { navigate(RequestsRoute) }
            DrawerButton(stringResource(R.string.tv_issues), TvSymbol.Issues, expanded,
                currentRoute?.contains("IssuesRoute") == true || currentRoute?.contains("IssueDetailRoute") == true,
                focus = if (expanded && (currentRoute?.contains("IssuesRoute") == true || currentRoute?.contains("IssueDetailRoute") == true)) selectedFocus else null) { navigate(IssuesRoute) }
            if (!expanded) DrawerButton(stringResource(R.string.tv_more), TvSymbol.More, false, false) {
                onExpand?.invoke() ?: navigate(ListsRoute)
            }
        }
    }
}

@Composable
private fun DrawerButton(label: String, icon: TvSymbol, expanded: Boolean, selected: Boolean, focus: FocusRequester? = null, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.width(if (expanded) 200.dp else 40.dp).height(32.dp)
            .pointerClick(onClick = onClick)
            .semantics { contentDescription = label; this.selected = selected }
            .then(if (focus != null) Modifier.focusRequester(focus) else Modifier),
        contentPadding = PaddingValues(horizontal = if (expanded) 12.dp else 4.dp, vertical = 4.dp),
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f, focusedDisabledScale = 1f),
        border = ButtonDefaults.border(),
        colors = ButtonDefaults.colors(
            containerColor = Color.Transparent,
            contentColor = if (selected) MaterialTheme.colorScheme.primary else Color(0xFFCCCCCC),
            focusedContainerColor = Color.White,
            focusedContentColor = Color.Black,
        ),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (expanded) Arrangement.spacedBy(12.dp) else Arrangement.Center) {
            Icon(painterResource(icon.resource), contentDescription = null, modifier = Modifier.size(18.dp))
            if (expanded) Text(label, fontSize = 13.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
