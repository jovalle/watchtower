"""Check an ADB uiautomator XML capture of the standalone TV player."""
import sys
import xml.etree.ElementTree as ET

nodes = list(ET.parse(sys.argv[1]).iter("node"))
assert any(node.get("package") == "io.github.jovalle.watchtower.tv.debug" for node in nodes), "Watchtower is not visible"
assert not any(node.get("content-desc") == "Home" for node in nodes), "The library drawer is visible during playback"
assert any(node.get("content-desc") in {"Pause video", "Play video"} for node in nodes), "Player controls are not visible"
assert any(node.get("focused") == "true" for node in nodes), "The player has no focused remote target"
print("Player controls are visible and focused; the library drawer is absent.")
