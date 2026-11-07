package io.github.jovalle.watchtower.tv.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import io.github.jovalle.watchtower.tv.ui.ActionHintPosition
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import io.github.jovalle.watchtower.tv.R
import java.text.NumberFormat
import kotlin.math.floor
import kotlin.math.roundToInt

@Composable
internal fun RatingControl(rating: Double?, enabled: Boolean, onRating: (Double?) -> Unit,
    modifier: Modifier = Modifier, initialFocus: Boolean = false,
    editing: Boolean = true, onEdit: () -> Unit = {}, onDone: () -> Unit = {},
    onLeave: () -> Unit = {}, pending: Boolean = false, expanded: Boolean = true) {
    // Plex stores 0–10; each stored point is half a displayed star.
    val stored = rating?.roundToInt()?.coerceIn(0, 10) ?: 0
    var keyboardSteps by remember(rating) { mutableIntStateOf(stored) }
    var hoverSteps by remember(rating) { mutableIntStateOf(stored) }
    var hovered by remember(rating) { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf(editing) }
    val preview = if (hovered) hoverSteps else keyboardSteps
    val primary = remember { FocusRequester() }
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val colors = MaterialTheme.colorScheme
    val number = NumberFormat.getNumberInstance(LocalConfiguration.current.locales[0]).apply { maximumFractionDigits = 1 }.format(preview / 2.0)
    val description = stringResource(if (expanded) R.string.rating_control else R.string.cat_rate)
    val state = when {
        rating == null && preview == 0 -> stringResource(R.string.rating_not_set_description)
        rating != null && preview == stored -> stringResource(R.string.rating_set_description, number)
        else -> stringResource(R.string.rating_preview_description, number)
    }
    val commit by rememberUpdatedState<(Int) -> Unit>({ steps ->
        if (enabled && rating != steps.toDouble()) onRating(steps.toDouble())
    })
    LaunchedEffect(initialFocus) { if (initialFocus) primary.requestFocus() }
    LaunchedEffect(editing) { active = editing; if (!editing) { keyboardSteps = stored; hovered = false } }
    BackHandler(enabled = focused && active) { keyboardSteps = stored; hovered = false; active = false; onDone() }
    val windowFocused = LocalWindowInfo.current.isWindowFocused
    BoxWithConstraints(modifier.width(if (expanded) 208.dp else 48.dp).height(60.dp)) {
        val starWidth = (maxWidth - 8.dp).coerceIn(1.dp, 200.dp)
        Surface(onClick = {
            if (active) { commit(if (hovered) hoverSteps else keyboardSteps); active = false; onDone() } else { active = true; onEdit() }
        }, enabled = enabled,
            modifier = Modifier.width(starWidth).height(40.dp).testTag("star-rating").focusRequester(primary)
                .onFocusChanged {
                    val left = focused && !it.isFocused
                    focused = it.isFocused
                    if (left) { keyboardSteps = stored; hovered = false; active = false; onLeave() }
                }
                .onPreviewKeyEvent { event ->
                    if (!enabled || !active || event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    val delta = when (event.key) { Key.DirectionLeft -> if (rtl) 1 else -1; Key.DirectionRight -> if (rtl) -1 else 1; else -> return@onPreviewKeyEvent false }
                    keyboardSteps = ((if (hovered) hoverSteps else keyboardSteps) + delta).coerceIn(0, 10); hovered = false; true
                }
                .pointerInput(enabled, rating, rtl, active) {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            if (event.type == PointerEventType.Exit) hovered = false
                            else if (enabled && event.type in listOf(PointerEventType.Enter, PointerEventType.Move)) {
                                val mouse = event.changes.firstOrNull { it.type == PointerType.Mouse } ?: continue
                                if (event.type == PointerEventType.Enter) primary.requestFocus()
                                if (active) { hoverSteps = pointerRating(mouse.position.x, size.width, rtl); hovered = true }
                            }
                        }
                    }
                }
                .pointerInput(enabled, rating, rtl, active) {
                    detectTapGestures { position -> if (enabled) {
                        primary.requestFocus()
                        if (active) {
                            val steps = pointerRating(position.x, size.width, rtl)
                            keyboardSteps = steps; hoverSteps = steps; commit(steps); active = false; onDone()
                        } else { active = true; onEdit() }
                    } }
                }
                .semantics {
                    contentDescription = description; stateDescription = state
                    progressBarRangeInfo = ProgressBarRangeInfo(preview / 2f, 0f..5f, 9)
                    setProgress { stars ->
                        if (!enabled || !active || !stars.isFinite()) false else {
                            val steps = (stars * 2).roundToInt().coerceIn(0, 10)
                            keyboardSteps = steps; hovered = false; commit(steps); active = false; onDone(); true
                        }
                    }
                },
            shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)),
            colors = ClickableSurfaceDefaults.colors(containerColor = colors.surface.copy(alpha = .85f), focusedContainerColor = if (expanded) colors.onSurface.copy(alpha = .08f) else Color.White),
            scale = ClickableSurfaceDefaults.scale(focusedScale = 1f, pressedScale = 1f),
        ) {
            if (!expanded) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(painterResource(R.drawable.symbol_star), null, Modifier.size(16.dp), tint = if (focused) Color.Black else colors.onSurface)
                }
            } else Row(Modifier.fillMaxSize().then(if (focused) Modifier.border(1.dp, colors.onSurface, RoundedCornerShape(4.dp)) else Modifier)) {
                repeat(5) { index ->
                    val fraction = ((preview - index * 2) / 2f).coerceIn(0f, 1f)
                    Box(Modifier.weight(1f).height(40.dp).testTag("rating-star-${index + 1}"), contentAlignment = Alignment.Center) {
                        Icon(painterResource(R.drawable.symbol_star), null, Modifier.size(32.dp), tint = colors.onSurface.copy(alpha = if (enabled) .45f else .2f))
                        Icon(painterResource(R.drawable.symbol_star_filled), null, Modifier.size(32.dp).drawWithContent {
                            clipRect(left = if (rtl) size.width * (1 - fraction) else 0f, right = if (rtl) size.width else size.width * fraction) { this@drawWithContent.drawContent() }
                        }, tint = colors.primary.copy(alpha = if (enabled) 1f else .4f))
                    }
                }
            }
        }
        if (expanded) Text(if (pending) stringResource(R.string.saving) else if (rating == null && preview == 0) stringResource(R.string.rating_not_set_description) else "$number / 5",
            Modifier.width(starWidth).align(Alignment.BottomStart), color = colors.onSurface, fontSize = 10.sp, textAlign = TextAlign.Center)
        if (focused && enabled && windowFocused) {
            val gap = with(LocalDensity.current) { 8.dp.roundToPx() }
            val captionHeight = with(LocalDensity.current) { 20.dp.roundToPx() }
            Popup(popupPositionProvider = remember(gap, active, captionHeight) { ActionHintPosition(gap, preferBelow = !active, captionHeight = captionHeight) },
                properties = PopupProperties(focusable = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
                Text(stringResource(if (active) R.string.rating_adjust_hint else R.string.cat_rate), Modifier.widthIn(max = 280.dp)
                    .background(colors.surface, RoundedCornerShape(4.dp)).padding(8.dp),
                    color = colors.onSurface, fontSize = 10.sp, lineHeight = 14.sp)
            }
        }
    }
}

private fun pointerRating(x: Float, width: Int, rtl: Boolean): Int {
    val fraction = if (rtl) 1f - x / width else x / width
    return (floor(fraction * 10).toInt() + 1).coerceIn(1, 10)
}
