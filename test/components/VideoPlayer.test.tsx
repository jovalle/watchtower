import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@remix-run/react", () => ({ useNavigate: () => navigate }));
const navigate = vi.hoisted(() => vi.fn());
import { VideoPlayer } from "~/components/player/VideoPlayer";

const hls = vi.hoisted(() => ({
  handlers: new Map<string, (event: string, data: unknown) => void>(),
  startLoad: vi.fn(), recoverMediaError: vi.fn(), destroy: vi.fn(), stopLoad: vi.fn(),
}));
vi.mock("hls.js", () => ({
  default: class {
    static isSupported() { return true; }
    attachMedia() {}
    loadSource() {}
    on(event: string, handler: (event: string, data: unknown) => void) { hls.handlers.set(event, handler); }
    startLoad = hls.startLoad;
    recoverMediaError = hls.recoverMediaError;
    destroy = hls.destroy;
    stopLoad = hls.stopLoad;
  },
  Events: { MEDIA_ATTACHED: "attached", ERROR: "error" },
  ErrorTypes: { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { sendBeacon: vi.fn(() => true) }));
  hls.handlers.clear();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("stops after HLS exhausts its network retries instead of restarting them forever", async () => {
  render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" playbackMethod="transcode" />);
  await waitFor(() => expect(hls.handlers.has("error")).toBe(true));
  act(() => hls.handlers.get("error")!("error", { fatal: true, type: "networkError", details: "fragLoadError" }));
  expect(screen.getByText(/Failed to load video/)).toBeInTheDocument();
  expect(hls.startLoad).not.toHaveBeenCalled();
  expect(hls.destroy).toHaveBeenCalled();
});

it("stops the specific Plex session when the player unmounts", async () => {
  const { unmount } = render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" />);
  await waitFor(() => expect(hls.handlers.has("error")).toBe(true));
  unmount();
  expect(fetch).toHaveBeenCalledWith("/api/plex/hls/42/stop?session=test-session", { keepalive: true });
});

it("allows one media recovery, then exposes an error instead of looping", async () => {
  render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" playbackMethod="transcode" />);
  await waitFor(() => expect(hls.handlers.has("error")).toBe(true));
  const fail = () => hls.handlers.get("error")!("error", { fatal: true, type: "mediaError", details: "bufferAppendError" });
  act(fail);
  expect(screen.queryByText(/Failed to load video/)).not.toBeInTheDocument();
  act(fail);
  expect(screen.getByText(/Failed to load video/)).toBeInTheDocument();
  expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
});

it("keeps a buffered session alive and cancels keepalives after leaving", async () => {
  vi.useFakeTimers();
  const { unmount } = render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" />);
  await act(async () => {});
  fireEvent.playing(screen.getByLabelText("Video player: Example"));
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(fetch).toHaveBeenCalledWith("/api/plex/hls/42/ping?session=test-session");
  unmount();
  vi.mocked(fetch).mockClear();
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(fetch).not.toHaveBeenCalled();
});

it("reloads an unbuffered seek without sending a stopped timeline that can kill the replacement stream", async () => {
  vi.useFakeTimers();
  const beacon = vi.fn();
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" playbackMethod="direct_stream" />);
  await act(async () => {});
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  Object.defineProperty(video, "duration", { configurable: true, value: 1595 });
  fireEvent.canPlay(video);
  video.currentTime = 600;
  fireEvent.seeking(video);
  await act(async () => { vi.advanceTimersByTime(500); });
  expect(navigate).toHaveBeenCalledWith("/app/watch/42?t=600000", { replace: true });
  expect(beacon).not.toHaveBeenCalled();
});

it("uses the item's duration when Plex exposes a padded HLS timeline", async () => {
  render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" durationMs={1594240} playbackMethod="transcode" />);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  Object.defineProperty(video, "duration", { configurable: true, value: 7200 });
  fireEvent.loadedMetadata(video);
  expect(screen.getByText("26:34")).toBeInTheDocument();
  expect(screen.queryByText("2:00:00")).not.toBeInTheDocument();
  fireEvent.playing(video);
  expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute("aria-disabled", "false");
});

it("stops the session on document exit even when React does not unmount", async () => {
  const { unmount } = render(<VideoPlayer src="/api/plex/hls/42/start.m3u8?session=test-session" title="Example" ratingKey="42" />);
  await act(async () => {});
  window.dispatchEvent(new Event("pagehide"));
  expect(fetch).toHaveBeenCalledWith("/api/plex/hls/42/stop?session=test-session", { keepalive: true });
  unmount();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("covers the browser's native buffering indicator with one opaque loading status", () => {
  render(<VideoPlayer src="/api/plex/hls/42/start.m3u8" title="Example" ratingKey="42" />);
  const loading = screen.getByRole("status", { name: "Loading video" });
  expect(loading).toHaveClass("bg-black");
  fireEvent.playing(screen.getByLabelText("Video player: Example"));
  expect(screen.queryByRole("status", { name: "Loading video" })).not.toBeInTheDocument();
  fireEvent.waiting(screen.getByLabelText("Video player: Example"));
  expect(screen.getAllByRole("status", { name: "Loading video" })).toHaveLength(1);
});

it("retries a rejected watched report on the next completion event and stops after success", async () => {
  let attempts = 0;
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(null, {
    status: url === "/api/plex/scrobble" && ++attempts === 1 ? 503 : 200,
  })));
  render(<VideoPlayer src="/api/plex/stream/42" title="Example" ratingKey="42" durationMs={100000} />);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  video.currentTime = 95;
  await act(async () => { fireEvent.timeUpdate(video); });
  await act(async () => { fireEvent.ended(video); });
  await act(async () => { fireEvent.timeUpdate(video); });
  expect(attempts).toBe(2);
});

it.each([undefined, "/app/tv/100"])("Back exits playback to %s instead of traversing timestamp history", (backTo) => {
  render(<VideoPlayer src="/api/plex/hls/42/start.m3u8" title="Example" ratingKey="42" backTo={backTo} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Back" })[0]);
  expect(navigate).toHaveBeenCalledWith(backTo ?? "/app", { replace: true });
});

it.each([true, false])("honors next-episode autoplay=%s at completion", async (autoPlayNextEpisode) => {
  vi.useFakeTimers();
  render(<VideoPlayer src="/api/plex/stream/42" title="Example" ratingKey="42" autoPlayNextEpisode={autoPlayNextEpisode} nextEpisode={{ ratingKey: "43", title: "Next", label: "S1:E2" }} />);
  await act(async () => { fireEvent.ended(screen.getByLabelText("Video player: Example")); });
  for (let second = 0; second < 10; second++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  }
  if (autoPlayNextEpisode) {
    expect(navigate).toHaveBeenCalledWith("/app/watch/43", { replace: true });
    expect(navigate).toHaveBeenCalledTimes(1);
  } else {
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play next episode" }));
    expect(navigate).toHaveBeenCalledWith("/app/watch/43", { replace: true });
  }
});

it("cancels the next-episode countdown", async () => {
  vi.useFakeTimers();
  render(<VideoPlayer src="/api/plex/stream/42" title="Example" ratingKey="42" nextEpisode={{ ratingKey: "43", title: "Next", label: "S1:E2" }} />);
  await act(async () => { fireEvent.ended(screen.getByLabelText("Video player: Example")); });
  fireEvent.click(screen.getByRole("button", { name: "Cancel next episode" }));
  for (let second = 0; second < 10; second++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  }
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Cancel next episode" })).not.toBeInTheDocument();
});

it("persists the last observed position once when source teardown resets the video", async () => {
  const { unmount } = render(<VideoPlayer src="/api/plex/stream/42?session=test-session" title="Example" ratingKey="42" durationMs={200000} />);
  const video = screen.getByLabelText("Video player: Example") as HTMLVideoElement;
  video.currentTime = 64;
  fireEvent.timeUpdate(video);
  video.currentTime = 0;
  window.dispatchEvent(new Event("pagehide"));
  unmount();
  expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  expect(JSON.parse(vi.mocked(navigator.sendBeacon).mock.calls[0][1] as string)).toMatchObject({ time: 64000, state: "stopped", session: "test-session", sequence: 1 });
});

it("offers the native receiver picker only after the browser reports availability", async () => {
  const picker = vi.fn();
  Object.defineProperty(HTMLVideoElement.prototype, "webkitShowPlaybackTargetPicker", { configurable: true, value: picker });
  try {
    render(<VideoPlayer src="/api/plex/stream/42" title="Example" ratingKey="42" />);
    expect(screen.queryByRole("button", { name: "Cast" })).not.toBeInTheDocument();
    const video = screen.getByLabelText("Video player: Example");
    fireEvent(video, Object.assign(new Event("webkitplaybacktargetavailabilitychanged"), { availability: "available" }));
    fireEvent.click(screen.getByRole("button", { name: "Cast" }));
    expect(picker).toHaveBeenCalledOnce();
    expect(video).toHaveAttribute("src", "/api/plex/stream/42");
  } finally { Reflect.deleteProperty(HTMLVideoElement.prototype, "webkitShowPlaybackTargetPicker"); }
});
