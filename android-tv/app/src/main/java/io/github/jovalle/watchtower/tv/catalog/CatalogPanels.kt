package io.github.jovalle.watchtower.tv.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.pointerClick

@Composable
internal fun CatalogOptionsDialog(
    title: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val primary = remember { FocusRequester() }
    CatalogDialogPanel(title, onDismiss) {
        LaunchedEffect(Unit) { primary.requestFocus() }
        options.forEachIndexed { index, (value, label) ->
            val select = { onSelect(value) }
            Button(
                onClick = select,
                modifier = Modifier.fillMaxWidth().heightIn(min = 32.dp).semantics { this.selected = value == selected }
                    .pointerClick(onClick = select)
                    .then(if (value == selected || (index == 0 && options.none { it.first == selected })) Modifier.focusRequester(primary) else Modifier),
                shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.LightGray,
                    focusedContainerColor = Color.White, focusedContentColor = Color.Black),
                scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
            ) { Text(label, fontSize = 13.sp, modifier = Modifier.fillMaxWidth()) }
        }
        TvAction(stringResource(R.string.cancel), TvSymbol.Close, onDismiss,
            modifier = if (options.isEmpty()) Modifier.focusRequester(primary) else Modifier)
    }
}

@Composable
internal fun CatalogDialogPanel(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val dismiss by rememberUpdatedState(onDismiss)
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler(onBack = onDismiss)
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
            Box(Modifier.matchParentSize().testTag("catalog-dialog-scrim").pointerInput(Unit) {
                detectTapGestures { dismiss() }
            })
            Column(Modifier.padding(16.dp).width(320.dp).fillMaxHeight().testTag("catalog-dialog-panel")
                .background(Color.Black, RoundedCornerShape(4.dp))
                .border(1.dp, Color(0xFF303030), RoundedCornerShape(4.dp))
                .pointerInput(Unit) { detectTapGestures { } }
                .verticalScroll(rememberScrollState()).padding(32.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth().padding(bottom = 24.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TvAction(stringResource(R.string.catalog_close), TvSymbol.Close, onDismiss, iconOnly = true)
                }
                content()
            }
        }
    }
}
