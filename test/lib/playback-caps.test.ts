import { describe, it, expect } from 'vitest';
import { canDirectPlay, parsePlaybackCaps, serializePlaybackCaps } from '~/lib/playback-caps';

const chrome = { containers: ['mp4', 'webm'], video: ['h264', 'vp9', 'av1'], audio: ['aac', 'mp3', 'opus', 'flac'] };

describe('canDirectPlay', () => {
  it('allows files whose container and codecs the browser supports', () => {
    expect(canDirectPlay({ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' }, chrome)).toBe(true);
    expect(canDirectPlay({ container: 'm4v', videoCodec: 'h264', audioCodec: 'aac' }, chrome)).toBe(true);
  });

  it('rejects unsupported containers, video, or audio', () => {
    expect(canDirectPlay({ container: 'mkv', videoCodec: 'h264', audioCodec: 'aac' }, chrome)).toBe(false);
    expect(canDirectPlay({ container: 'mp4', videoCodec: 'hevc', audioCodec: 'aac' }, chrome)).toBe(false);
    expect(canDirectPlay({ container: 'mp4', videoCodec: 'h264', audioCodec: 'truehd' }, chrome)).toBe(false);
    expect(canDirectPlay({ container: 'mp4', videoCodec: 'h264' }, chrome)).toBe(false);
  });

  it('rejects Dolby Vision profile 5 even when the codec is supported', () => {
    const safari = { containers: ['mp4', 'mov'], video: ['h264', 'hevc'], audio: ['aac', 'ac3', 'eac3'] };
    expect(canDirectPlay({ container: 'mp4', videoCodec: 'hevc', audioCodec: 'eac3' }, safari, 5)).toBe(false);
    expect(canDirectPlay({ container: 'mp4', videoCodec: 'hevc', audioCodec: 'eac3' }, safari, 8)).toBe(true);
  });
});

describe('parsePlaybackCaps', () => {
  it('round-trips through the cookie format', () => {
    const cookie = `other=1; playback_caps=${encodeURIComponent(serializePlaybackCaps(chrome))}; x=y`;
    expect(parsePlaybackCaps(cookie)).toEqual(chrome);
  });

  it('returns null when the cookie is missing or malformed', () => {
    expect(parsePlaybackCaps(null)).toBeNull();
    expect(parsePlaybackCaps('playback_caps=garbage')).toBeNull();
  });
});
