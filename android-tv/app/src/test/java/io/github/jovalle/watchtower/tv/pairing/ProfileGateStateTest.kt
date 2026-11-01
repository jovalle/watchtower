package io.github.jovalle.watchtower.tv.pairing

import io.github.jovalle.watchtower.tv.api.HomeProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileGateStateTest {
    private val selected = HomeProfile("profile", "Jay", false, true, true, false)

    @Test fun successfulSwitchClearsPinAndSelection() {
        val result = ProfileGateState(selected = selected, pin = "1234", busy = true).afterSwitch()

        assertNull(result.selected)
        assertEquals("", result.pin)
        assertFalse(result.busy)
        assertTrue(result.completed)
    }

    @Test fun failedSwitchClearsPinAndSelection() {
        val result = ProfileGateState(selected = selected, pin = "1234", busy = true).afterSwitch("Not accepted")

        assertNull(result.selected)
        assertEquals("", result.pin)
        assertFalse(result.busy)
        assertFalse(result.completed)
        assertEquals("Not accepted", result.error)
    }
}