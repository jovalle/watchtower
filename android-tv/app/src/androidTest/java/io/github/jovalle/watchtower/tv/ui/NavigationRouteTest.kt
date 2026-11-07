package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.catalog.DetailsRoute
import io.github.jovalle.watchtower.tv.catalog.HomeRoute
import io.github.jovalle.watchtower.tv.catalog.LibraryRoute
import io.github.jovalle.watchtower.tv.services.RequestsRoute
import org.junit.Rule
import org.junit.Test

class NavigationRouteTest {
    @get:Rule val compose = createComposeRule()

    @Test fun selectingAnotherLibraryDoesNotRestoreThePreviousLibrarysArguments() {
        compose.setContent { MaterialTheme {
            val navigation = rememberNavController()
            NavHost(navigation, startDestination = HomeRoute) {
                composable<HomeRoute> {
                    Button(onClick = { navigation.navigateFromRail(LibraryRoute("movies", "Movies")) }) { Text("Open Movies") }
                }
                composable<LibraryRoute> { entry ->
                    Column {
                        Text("Library ${entry.toRoute<LibraryRoute>().sectionId}")
                        Button(onClick = { navigation.navigateFromRail(RequestsRoute) }) { Text("Open requests") }
                    }
                }
                composable<RequestsRoute> {
                    Button(onClick = { navigation.navigateFromRail(LibraryRoute("series", "Series")) }) { Text("Open Series") }
                }
            }
        } }
        compose.onNodeWithText("Open Movies").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Library movies").assertIsDisplayed()
        compose.onNodeWithText("Open requests").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Open Series").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Library series").assertIsDisplayed()
    }

    @Test fun homeFromAnotherSourceReturnsToHomeRatherThanItsSavedDetails() {
        compose.setContent { MaterialTheme {
            val navigation = rememberNavController()
            NavHost(navigation, startDestination = HomeRoute) {
                composable<HomeRoute> {
                    Column {
                        Text("Home content")
                        Button(onClick = { navigation.navigate(DetailsRoute("movie")) }) { Text("Open details") }
                    }
                }
                composable<DetailsRoute> {
                    Button(onClick = { navigation.navigateFromRail(RequestsRoute) }) { Text("Open requests") }
                }
                composable<RequestsRoute> {
                    Button(onClick = { navigation.navigateFromRail(HomeRoute) }) { Text("Go Home") }
                }
            }
        } }
        compose.onNodeWithText("Open details").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Open requests").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Go Home").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Home content").assertIsDisplayed()
    }
}
