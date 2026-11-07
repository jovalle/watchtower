package io.github.jovalle.watchtower.tv.pairing

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.OutlinedButtonDefaults
import androidx.tv.material3.Text
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.pointerClick
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
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) { addressFocus.requestFocus() }
    Text(stringResource(R.string.server_prompt), fontSize = 15.sp)
    Spacer(Modifier.height(8.dp))
    BasicTextField(
        value = address,
        onValueChange = onAddressChange,
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(4.dp))
            .padding(horizontal = 18.dp, vertical = 12.dp)
            .focusRequester(addressFocus)
            .onPreviewKeyEvent {
                it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown &&
                    focusManager.moveFocus(FocusDirection.Down)
            },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { if (!submitting) onSubmit() }),
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.Black, fontSize = 16.sp),
        singleLine = true,
    )
    ErrorText(error)
    TvAction(if (submitting) stringResource(R.string.connecting) else stringResource(R.string.continue_action),
        TvSymbol.Next, onSubmit, enabled = !submitting, primary = true)
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
    Text(stringResource(R.string.pair_instructions), fontSize = 15.sp)
    Text(
        displayCode,
        fontSize = 40.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.semantics { contentDescription = state.userCode.toList().joinToString(" ") },
    )
    Text(state.verificationUri, fontSize = 16.sp)
    QrCode(state.verificationUriComplete)
    Text(stringResource(R.string.pair_expires, remainingSeconds / 60, remainingSeconds % 60), fontSize = 13.sp, color = Color.LightGray)
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
        TvAction(stringResource(R.string.try_again), TvSymbol.Refresh, onRetry)
        TvAction(stringResource(R.string.change_server), TvSymbol.Link, onChangeServer)
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
            else -> ProfileList(state.profiles, state.error, controller::choose,
                onRetry = { graph.appScope.launch { controller.load() } })
        }
    }
}

@Composable
internal fun ProfileList(profiles: List<HomeProfile>, error: String?, onChoose: (HomeProfile) -> Unit, onRetry: (() -> Unit)? = null) {
    val primaryFocus = remember { FocusRequester() }
    LaunchedEffect(profiles, error) { if (profiles.isNotEmpty() || (error != null && onRetry != null)) primaryFocus.requestFocus() }
    ErrorText(error)
    if (profiles.isEmpty() && error != null && onRetry != null) {
        TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetry, Modifier.focusRequester(primaryFocus))
    }
    profiles.forEachIndexed { index, profile ->
        val choose = { onChoose(profile) }
        Button(
            onClick = choose,
            modifier = Modifier.fillMaxWidth().heightIn(min = 36.dp).pointerClick(onClick = choose)
                .then(if (index == 0) Modifier.focusRequester(primaryFocus) else Modifier),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
            scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
            colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.White,
                focusedContainerColor = Color.White, focusedContentColor = Color.Black),
        ) {
            Text(profile.title + if (profile.protected) "  •  ${stringResource(R.string.pin_required)}" else "", fontSize = 15.sp)
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
        modifier = Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(4.dp)).padding(12.dp),
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.Black, fontSize = 24.sp),
        visualTransformation = PasswordVisualTransformation(),
        readOnly = true,
    )
    ErrorText(state.error)
    listOf(listOf(1, 2, 3), listOf(4, 5, 6), listOf(7, 8, 9)).forEach { row ->
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { digit ->
                val enterDigit = { controller.digit(digit) }
                Button(
                    onClick = enterDigit, modifier = Modifier.size(48.dp).pointerClick(onClick = enterDigit),
                    contentPadding = PaddingValues(0.dp),
                    shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                    scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
                    colors = ButtonDefaults.colors(containerColor = MaterialTheme.colorScheme.surface, contentColor = Color.White,
                        focusedContainerColor = Color.White, focusedContentColor = Color.Black),
                ) { Text(digit.toString()) }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(
            onClick = controller::cancelPin, modifier = Modifier.heightIn(min = 48.dp).pointerClick(onClick = controller::cancelPin),
            shape = OutlinedButtonDefaults.shape(RoundedCornerShape(4.dp)),
            scale = OutlinedButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
            colors = OutlinedButtonDefaults.colors(contentColor = Color.White, focusedContainerColor = Color.White, focusedContentColor = Color.Black),
        ) { Text(stringResource(R.string.cancel)) }
        Button(
            onClick = { controller.digit(0) }, modifier = Modifier.size(48.dp).pointerClick(onClick = { controller.digit(0) }),
            contentPadding = PaddingValues(0.dp),
            shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
            scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
            colors = ButtonDefaults.colors(containerColor = MaterialTheme.colorScheme.surface, contentColor = Color.White,
                focusedContainerColor = Color.White, focusedContentColor = Color.Black),
        ) { Text("0") }
        TvAction(stringResource(R.string.erase), TvSymbol.Back, controller::erase)
        TvAction(stringResource(R.string.continue_action), TvSymbol.Check, controller::submitPin, enabled = !state.busy, primary = true)
    }
}

@Composable
private fun AuthPanel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(horizontal = 64.dp, vertical = 24.dp), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.watchtower_wordmark), contentDescription = stringResource(R.string.app_name),
            modifier = Modifier.align(Alignment.TopStart).width(168.dp).height(28.dp))
        Column(
            modifier = Modifier.padding(top = 40.dp).fillMaxWidth(0.62f)
                .background(Color.Black, RoundedCornerShape(4.dp))
                .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                .verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
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
