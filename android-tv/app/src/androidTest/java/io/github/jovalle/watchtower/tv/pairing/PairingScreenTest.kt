package io.github.jovalle.watchtower.tv.pairing

import android.os.SystemClock
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.HomeProfile
import io.github.jovalle.watchtower.tv.auth.PairingState
import org.junit.Rule
import org.junit.Test

class PairingScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun waitingStateShowsCodeUrlQrAndCountdown() {
        compose.setContent {
            MaterialTheme {
                Column {
                    PairingStateContent(
                        state = PairingState.Waiting(
                            userCode = "BCDFGHJK",
                            verificationUri = "https://watchtower.test/link",
                            verificationUriComplete = "https://watchtower.test/link?code=BCDFGHJK",
                            expiresAtElapsedMs = SystemClock.elapsedRealtime() + 120_000,
                        ),
                        onRetry = {},
                        onChangeServer = {},
                    )
                }
            }
        }

        compose.onNodeWithText("BCDF - GHJK").assertIsDisplayed()
        compose.onNodeWithText("https://watchtower.test/link").assertIsDisplayed()
        compose.onNodeWithContentDescription("QR code for the Watchtower pairing page").assertIsDisplayed()
        compose.onNodeWithText("Expires in", substring = true).assertIsDisplayed()
    }

    @Test fun expiredStateOffersRetryAndServerChange() {
        compose.setContent {
            MaterialTheme { PairingStateContent(PairingState.Expired, onRetry = {}, onChangeServer = {}) }
        }
        compose.onNodeWithText("Try again").assertIsDisplayed()
        compose.onNodeWithText("Change server").assertIsDisplayed()
    }

    @Test fun serverAddressFieldReceivesInitialFocus() {
        compose.setContent {
            MaterialTheme {
                Column {
                    ServerAddressContent(
                        address = "https://watchtower.test",
                        error = null,
                        submitting = false,
                        onAddressChange = {},
                        onSubmit = {},
                    )
                }
            }
        }

        compose.onNode(hasSetTextAction()).assertIsFocused()
    }

    @Test fun firstProfileReceivesInitialFocus() {
        val profiles = listOf(
            HomeProfile("first", "Jay", restricted = false, protected = false, admin = true, current = false),
            HomeProfile("second", "Guest", restricted = false, protected = false, admin = false, current = false),
        )
        compose.setContent {
            MaterialTheme { Column { ProfileList(profiles, error = null, onChoose = {}) } }
        }

        compose.onNodeWithText("Jay").assertIsFocused()
    }
}