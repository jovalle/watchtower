package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text

internal enum class StatusTone { Success, Pending, Progress, Attention, Neutral }

internal fun statusTone(status: String): StatusTone = when (status.lowercase().replace('_', ' ')) {
    "available", "resolved" -> StatusTone.Success
    "pending", "awaiting approval", "partially available" -> StatusTone.Pending
    "approved", "processing", "completed; library availability pending" -> StatusTone.Progress
    "open", "failed", "declined", "blocked", "blocklisted" -> StatusTone.Attention
    else -> StatusTone.Neutral
}

@Composable
internal fun MediaStatusBadge(label: String, status: String = label) {
    val (foreground, background) = when (statusTone(status)) {
        StatusTone.Success -> Color(0xFF86EFAC) to Color(0xFF153525)
        StatusTone.Pending -> Color(0xFFFDE68A) to Color(0xFF3B3015)
        StatusTone.Progress -> Color(0xFF93C5FD) to Color(0xFF172F4B)
        StatusTone.Attention -> Color(0xFFFDA4AF) to Color(0xFF431D27)
        StatusTone.Neutral -> Color(0xFFD4D4D8) to Color(0xFF303036)
    }
    Text(label, color = foreground, fontSize = 12.sp, lineHeight = 16.sp,
        modifier = Modifier.background(background, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
}
