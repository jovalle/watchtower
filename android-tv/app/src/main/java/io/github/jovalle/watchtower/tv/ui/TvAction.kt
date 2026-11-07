package io.github.jovalle.watchtower.tv.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import androidx.compose.foundation.border
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Border
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.R

enum class TvSymbol(@DrawableRes val resource: Int) {
    Play(R.drawable.symbol_play),
    Pause(R.drawable.symbol_pause),
    Restart(R.drawable.symbol_restart),
    Previous(R.drawable.symbol_previous),
    Next(R.drawable.symbol_next),
    Rewind(R.drawable.symbol_rewind),
    Forward(R.drawable.symbol_forward),
    Audio(R.drawable.symbol_audio),
    Subtitles(R.drawable.symbol_subtitles),
    Settings(R.drawable.symbol_settings),
    More(R.drawable.symbol_more),
    Info(R.drawable.symbol_info),
    Home(R.drawable.symbol_home),
    Search(R.drawable.symbol_search),
    Movies(R.drawable.symbol_movies),
    Shows(R.drawable.symbol_shows),
    Bookmark(R.drawable.symbol_bookmark),
    BookmarkFilled(R.drawable.symbol_bookmark_filled),
    Requests(R.drawable.symbol_requests),
    Issues(R.drawable.symbol_issues),
    Check(R.drawable.symbol_check),
    Plus(R.drawable.symbol_plus),
    Close(R.drawable.symbol_close),
    Back(R.drawable.symbol_back),
    Sort(R.drawable.symbol_sort),
    Filter(R.drawable.symbol_filter),
    Grid(R.drawable.symbol_grid),
    Collection(R.drawable.symbol_collection),
    List(R.drawable.symbol_list),
    Star(R.drawable.symbol_star),
    Refresh(R.drawable.symbol_refresh),
    Logout(R.drawable.symbol_logout),
    Link(R.drawable.symbol_link),
    Send(R.drawable.symbol_send),
}

@Composable
fun TvAction(
    label: String,
    icon: TvSymbol,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    primary: Boolean = false,
    selected: Boolean = false,
    description: String = label,
    iconOnly: Boolean = false,
    stateDescription: String? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val windowFocused = LocalWindowInfo.current.isWindowFocused
    Box(modifier.padding(end = 8.dp)
        .then(if (!primary || iconOnly) Modifier.width(if (iconOnly) 32.dp else 40.dp) else Modifier)
        .height(if (iconOnly) 32.dp else 60.dp)) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.align(Alignment.TopStart).height(if (iconOnly) 32.dp else 40.dp)
                .then(if (primary && !iconOnly) Modifier.widthIn(min = 96.dp) else Modifier.width(if (iconOnly) 32.dp else 40.dp))
                .onFocusChanged { focused = it.isFocused }
                .pointerClick(enabled, onClick)
                .semantics {
                    contentDescription = description
                    this.selected = selected
                    stateDescription?.let { this.stateDescription = it }
                },
            contentPadding = if (primary && !iconOnly) PaddingValues(horizontal = 16.dp) else PaddingValues(0.dp),
            shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
            scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f, focusedDisabledScale = 1f),
            border = ButtonDefaults.border(),
            colors = ButtonDefaults.colors(
                containerColor = if (iconOnly) Color.Transparent else if (primary) colors.primary else colors.surface.copy(alpha = if (selected) 1f else 0.85f),
                contentColor = if (primary && !iconOnly) colors.onPrimary else Color.White,
                focusedContainerColor = Color.White,
                focusedContentColor = Color.Black,
            ),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(painterResource(icon.resource), contentDescription = null, modifier = Modifier.size(16.dp))
                if (primary && !iconOnly) Text(label, fontSize = 12.sp, maxLines = 1)
            }
        }
        if (focused && enabled && windowFocused && (!primary || iconOnly)) {
            val gap = with(LocalDensity.current) { 8.dp.roundToPx() }
            val captionHeight = with(LocalDensity.current) { (if (iconOnly) 0.dp else 20.dp).roundToPx() }
            Popup(popupPositionProvider = remember(gap, captionHeight) { ActionHintPosition(gap, preferBelow = !iconOnly, captionHeight = captionHeight) },
                properties = PopupProperties(focusable = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
                Text(label, modifier = Modifier.widthIn(max = 180.dp)
                    .background(colors.surface, RoundedCornerShape(4.dp))
                    .border(1.dp, colors.onSurface.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                    color = colors.onSurface, fontSize = 10.sp, lineHeight = 12.sp,
                    textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }

    }
}

internal class ActionHintPosition(private val gap: Int, private val preferBelow: Boolean, private val captionHeight: Int = 0) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val x = (anchorBounds.center.x - popupContentSize.width / 2)
            .coerceIn(gap, (windowSize.width - popupContentSize.width - gap).coerceAtLeast(gap))
        val above = anchorBounds.top - popupContentSize.height - gap
        val below = anchorBounds.bottom - captionHeight + if (preferBelow) 0 else gap
        val preferred = if (preferBelow && popupContentSize.height <= captionHeight) below
            else if (above >= gap) above else below
        val y = preferred.coerceIn(gap, (windowSize.height - popupContentSize.height - gap).coerceAtLeast(gap))
        return IntOffset(x, y)
    }
}

// Hover follows TV focus; background click layers can opt out without changing activation.
internal fun Modifier.pointerClick(enabled: Boolean = true, onClick: () -> Unit, requestFocusOnHover: Boolean = true): Modifier = composed {
    val action by rememberUpdatedState(onClick)
    val pointerFocus = remember { FocusRequester() }
    focusRequester(pointerFocus).pointerInput(enabled, requestFocusOnHover) {
        awaitPointerEventScope {
            while (true) {
                val event = awaitPointerEvent()
                if (enabled && requestFocusOnHover && event.type == PointerEventType.Enter &&
                    event.changes.any { it.type == PointerType.Mouse }) pointerFocus.requestFocus()
            }
        }
    }.pointerInput(enabled) {
        detectTapGestures { if (enabled) { pointerFocus.requestFocus(); action() } }
    }
}

@Composable
fun TvToggleIndicator(checked: Boolean, enabled: Boolean = true) {
    val gold = MaterialTheme.colorScheme.primary
    val opacity = if (enabled) 1f else 0.4f
    val track = if (checked) gold.copy(alpha = 0.4f * opacity) else Color(0xFF303438).copy(alpha = opacity)
    Box(Modifier.size(width = 26.dp, height = 16.dp).background(track, RoundedCornerShape(8.dp))) {
        Box(Modifier.align(if (checked) Alignment.CenterEnd else Alignment.CenterStart).size(16.dp)
            .background((if (checked) gold else Color(0xFF6B7077)).copy(alpha = opacity), RoundedCornerShape(50)))
    }
}
