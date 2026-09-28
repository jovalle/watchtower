package io.github.jovalle.watchtower.tv.pairing

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.ApiException
import io.github.jovalle.watchtower.tv.api.HomeProfile
import io.github.jovalle.watchtower.tv.auth.PairingState
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

@Composable
fun ServerAddressScreen(graph: AppGraph, initialAddress: String?, message: String?) {
    var address by remember(initialAddress) { mutableStateOf(initialAddress.orEmpty()) }
    var error by remember(message) { mutableStateOf(message) }
    var submitting by remember { mutableStateOf(false) }

    AuthPanel(title = stringResource(R.string.server_title)) {
        ServerAddressContent(address, error, submitting, { address = it; error = null }) {
            if (!submitting) {
                submitting = true
                graph.appScope.launch {
                    error = graph.session.chooseServer(address)
                    submitting = false
                }
            }
        }
    }
}

@Composable
internal fun ServerAddressContent(
    address: String,
    error: String?,
    submitting: Boolean,
    onAddressChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val addressFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { addressFocus.requestFocus() }
    Text(stringResource(R.string.server_prompt), fontSize = 18.sp)
    Spacer(Modifier.height(18.dp))
    BasicTextField(
        value = address,
        onValueChange = onAddressChange,
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(3.dp, MaterialTheme.colorScheme.primary)
            .padding(16.dp)
            .focusRequester(addressFocus)
            .focusable(),
        textStyle = TextStyle(color = Color.Black, fontSize = 20.sp),
        singleLine = true,
    )
    ErrorText(error)
    Button(onClick = onSubmit, enabled = !submitting) {
        Text(if (submitting) stringResource(R.string.connecting) else stringResource(R.string.continue_action))
    }
}

@Composable
fun PairingScreen(graph: AppGraph, message: String?) {
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember(attempt) { mutableStateOf<PairingState>(PairingState.Requesting) }
    LaunchedEffect(attempt) {
        graph.session.pair().catch { state = PairingState.Failed(it.message ?: "") }.collect { state = it }
    }

    AuthPanel(title = stringResource(R.string.pair_title)) {
        message?.let { ErrorText(it) }
        PairingStateContent(state, onRetry = { attempt++ }, onChangeServer = graph.session::changeServer)
    }
}

@Composable
fun PairingStateContent(state: PairingState, onRetry: () -> Unit, onChangeServer: () -> Unit) {
    when (state) {
        PairingState.Requesting -> Text(stringResource(R.string.requesting_code), fontSize = 20.sp)
        is PairingState.Waiting -> WaitingForPairing(state)
        PairingState.Approved -> Text(stringResource(R.string.pair_approved), fontSize = 20.sp)
        PairingState.Denied -> PairingTerminal(stringResource(R.string.pair_denied), onRetry, onChangeServer)
        PairingState.Expired -> PairingTerminal(stringResource(R.string.pair_expired), onRetry, onChangeServer)
        is PairingState.Failed -> PairingTerminal(state.message, onRetry, onChangeServer)
    }
}

@Composable
private fun WaitingForPairing(state: PairingState.Waiting) {
    var remainingSeconds by remember(state.expiresAtElapsedMs) {
        mutableStateOf(((state.expiresAtElapsedMs - SystemClock.elapsedRealtime()).coerceAtLeast(0) / 1_000))
    }
    LaunchedEffect(state.expiresAtElapsedMs) {
        while (remainingSeconds > 0) {
            kotlinx.coroutines.delay(1_000)
            remainingSeconds = ((state.expiresAtElapsedMs - SystemClock.elapsedRealtime()).coerceAtLeast(0) / 1_000)
        }
    }
    val displayCode = state.userCode.replace("-", "").chunked(4).joinToString(" - ")
    Text(stringResource(R.string.pair_instructions), fontSize = 18.sp)
    Text(
        displayCode,
        fontSize = 46.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.semantics { contentDescription = state.userCode.toList().joinToString(" ") },
    )
    Text(state.verificationUri, fontSize = 20.sp)
    QrCode(state.verificationUriComplete)
    Text(stringResource(R.string.pair_expires, remainingSeconds / 60, remainingSeconds % 60), fontSize = 16.sp)
}

@Composable
private fun QrCode(value: String) {
    val image = remember(value) {
        val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 280, 280)
        val pixels = IntArray(matrix.width * matrix.height) { index ->
            if (matrix[index % matrix.width, index / matrix.width]) android.graphics.Color.BLACK else android.graphics.Color.WHITE
        }
        Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.RGB_565).apply {
            setPixels(pixels, 0, matrix.width, 0, 0, matrix.width, matrix.height)
        }.asImageBitmap()
    }
    Image(
        bitmap = image,
        contentDescription = stringResource(R.string.pair_qr_description),
        modifier = Modifier.size(180.dp).background(Color.White).padding(6.dp),
    )
}

@Composable
private fun PairingTerminal(message: String, onRetry: () -> Unit, onChangeServer: () -> Unit) {
    ErrorText(message)
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = onRetry) { Text(stringResource(R.string.try_again)) }
        OutlinedButton(onClick = onChangeServer) { Text(stringResource(R.string.change_server)) }
    }
}

data class ProfileGateState(
    val loading: Boolean = true,
    val profiles: List<HomeProfile> = emptyList(),
    val selected: HomeProfile? = null,
    val pin: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val completed: Boolean = false,
)

class ProfileGateController(private val graph: AppGraph) {
    var state by mutableStateOf(ProfileGateState())
        private set

    suspend fun load() {
        val snapshot = graph.session.current() ?: return
        state = ProfileGateState(loading = true)
        state = try {
            val profiles = graph.api.profiles(snapshot).items
            if (graph.session.current() != snapshot) ProfileGateState() else ProfileGateState(loading = false, profiles = profiles)
        } catch (error: Exception) {
            ProfileGateState(loading = false, error = error.message ?: "Unable to load profiles.")
        }
    }

    fun choose(profile: HomeProfile) {
        if (profile.protected) {
            state = state.copy(selected = profile, pin = "", error = null)
        } else if (profile.current) {
            state = state.copy(completed = true)
        } else {
            switch(profile, null)
        }
    }

    fun digit(value: Int) {
        state = state.copy(pin = state.pin + value, error = null)
    }

    fun erase() {
        state = state.copy(pin = state.pin.dropLast(1), error = null)
    }

    fun cancelPin() {
        state = state.copy(selected = null, pin = "", error = null)
    }

    fun submitPin() {
        state.selected?.let { switch(it, state.pin) }
    }

    private fun switch(profile: HomeProfile, pin: String?) {
        if (state.busy) return
        state = state.copy(busy = true, error = null)
        graph.appScope.launch {
            try {
                graph.session.switchProfile(profile.profileId, pin)
                state = state.afterSwitch()
            } catch (error: ApiException) {
                val message = when (error.code) {
                    "invalid_pin" -> "That PIN was not accepted."
                    "rate_limited" -> "Too many attempts. Wait before trying again."
                    else -> error.message ?: "Profile change failed."
                }
                state = state.afterSwitch(message)
            } catch (error: Exception) {
                state = state.afterSwitch(error.message ?: "Profile change failed.")
            }
        }
    }
}

@Composable
fun ProfileChooser(graph: AppGraph, controller: ProfileGateController) {
    val state = controller.state
    LaunchedEffect(controller) { controller.load() }
    AuthPanel(title = stringResource(R.string.choose_profile)) {
        when {
            state.loading -> Text(stringResource(R.string.loading))
            state.selected != null -> PinPad(state, controller)
            else -> ProfileList(state.profiles, state.error, controller::choose)
        }
    }
}

@Composable
internal fun ProfileList(profiles: List<HomeProfile>, error: String?, onChoose: (HomeProfile) -> Unit) {
    val primaryFocus = remember { FocusRequester() }
    LaunchedEffect(profiles) { if (profiles.isNotEmpty()) primaryFocus.requestFocus() }
    ErrorText(error)
    profiles.forEachIndexed { index, profile ->
        Button(
            onClick = { onChoose(profile) },
            modifier = Modifier.fillMaxWidth().then(if (index == 0) Modifier.focusRequester(primaryFocus) else Modifier),
        ) {
            Text(profile.title + if (profile.protected) "  •  ${stringResource(R.string.pin_required)}" else "")
        }
    }
}

internal fun ProfileGateState.afterSwitch(error: String? = null) = copy(
    selected = null,
    pin = "",
    busy = false,
    error = error,
    completed = error == null,
)

@Composable
private fun PinPad(state: ProfileGateState, controller: ProfileGateController) {
    Text(stringResource(R.string.enter_pin_for, state.selected?.title.orEmpty()), fontSize = 20.sp)
    BasicTextField(
        value = state.pin,
        onValueChange = {},
        modifier = Modifier.fillMaxWidth().background(Color.White).padding(14.dp),
        textStyle = TextStyle(color = Color.Black, fontSize = 24.sp),
        visualTransformation = PasswordVisualTransformation(),
        readOnly = true,
    )
    ErrorText(state.error)
    listOf(listOf(1, 2, 3), listOf(4, 5, 6), listOf(7, 8, 9)).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { digit -> Button(onClick = { controller.digit(digit) }) { Text(digit.toString()) } }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(onClick = controller::cancelPin) { Text(stringResource(R.string.cancel)) }
        Button(onClick = { controller.digit(0) }) { Text("0") }
        OutlinedButton(onClick = controller::erase) { Text(stringResource(R.string.erase)) }
        Button(onClick = controller::submitPin, enabled = !state.busy) { Text(stringResource(R.string.continue_action)) }
    }
}

@Composable
private fun AuthPanel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0xFF0A0A0A)).padding(52.dp), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.fillMaxWidth(0.62f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun ErrorText(message: String?) {
    if (!message.isNullOrBlank()) {
        Text(
            message,
            color = Color(0xFFFF8A80),
            fontSize = 16.sp,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}