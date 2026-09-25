import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@remix-run/react", () => ({ useNavigate: () => navigate }));
const navigate = vi.hoisted(() => vi.fn());
import { VideoPlayer } from "~/components/player/VideoPlayer";

vi.mock("hls.js", () => ({
  default: class {
    static isSupported() { return true; }
    attachMedia() {}
    loadSource() {}
    on() {}
    destroy() {}
  },
  Events: { MEDIA_ATTACHED: "attached", ERROR: "error" },
  ErrorTypes: { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" },
}));

const audioTracks = [
  { id: 11, displayTitle: "English (AAC Stereo)", selected: true },
  { id: 12, displayTitle: "Japanese (AC3 5.1)" },
];
const subtitleTracks = [
  { id: 21, displayTitle: "English (SRT External)", languageCode: "eng", sidecarUrl: "/api/plex/subtitles/21" },
  { id: 22, displayTitle: "English (PGS)", languageCode: "eng" },
];

function renderPlayer(fetchStatus = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: fetchStatus })));
  render(
    <VideoPlayer
      src="/api/plex/hls/42/start.m3u8?session=s"
      title="Example"
      ratingKey="42"
      partId={500}
      audioTracks={audioTracks}
      subtitleTracks={subtitleTracks}
    />,
  );
  fireEvent.click(screen.getByLabelText("Settings"));
}

const streamCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/plex/streams");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("saves an audio pick on Plex and restarts the stream at the current position", async () => {
  renderPlayer();
  (screen.getByLabelText("Video player: Example") as HTMLVideoElement).currentTime = 125;
  fireEvent.click(screen.getByText("Audio"));
  await act(async () => { fireEvent.click(screen.getByText("Japanese (AC3 5.1)")); });

  expect(JSON.parse(String(streamCalls()[0][1]!.body))).toEqual({ partId: 500, audioStreamID: 12 });
  expect(navigate).toHaveBeenCalledWith("/app/watch/42?t=125000", { replace: true });
});

it("switches an external SRT in place as a sidecar track without restarting", async () => {
  renderPlayer();
  fireEvent.click(screen.getByText("Subtitles"));
  await act(async () => { fireEvent.click(screen.getByText("English (SRT External)")); });

  expect(JSON.parse(String(streamCalls()[0][1]!.body))).toEqual({ partId: 500, subtitleStreamID: 21 });
  expect(navigate).not.toHaveBeenCalled();
  expect(document.querySelector("video track")).toHaveAttribute("src", "/api/plex/subtitles/21");
});

it("restarts the stream so Plex can burn in an image subtitle", async () => {
  renderPlayer();
  fireEvent.click(screen.getByText("Subtitles"));
  await act(async () => { fireEvent.click(screen.getByText("English (PGS)")); });

  expect(JSON.parse(String(streamCalls()[0][1]!.body))).toEqual({ partId: 500, subtitleStreamID: 22 });
  expect(navigate).toHaveBeenCalledOnce();
});

it("keeps the previous track and says so when Plex rejects the change", async () => {
  renderPlayer(500);
  fireEvent.click(screen.getByText("Audio"));
  await act(async () => { fireEvent.click(screen.getByText("Japanese (AC3 5.1)")); });

  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't change the track");
  expect(navigate).not.toHaveBeenCalled();
});
