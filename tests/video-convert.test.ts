import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { videoCommand, convertVideo, probeVideo } from '../lib/video-convert';

const available =
  spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], {
    windowsHide: true,
    stdio: 'ignore',
  }).status === 0;

for (const variant of ['hevc', 'h264', 'hdr', 'rotated'] as const)
  test(
    'real FFmpeg makes a playable bounded ' + variant + ' copy and poster',
    { skip: !available },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'qk-encode-'));
      const signal = AbortSignal.timeout(60000);
      const input = join(dir, 'input.mov');
      const output = join(dir, 'output.mp4');
      const poster = join(dir, 'poster.jpg');
      try {
        const args = [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-filter_threads',
          '1',
          '-f',
          'lavfi',
          '-i',
          'color=c=blue:s=96x160:r=12',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=44100',
          '-t',
          '0.5',
          '-threads',
          '1',
          '-c:v',
          ['h264', 'rotated'].includes(variant) ? 'libx264' : 'libx265',
        ];
        if (!['h264', 'rotated'].includes(variant))
          args.push(
            '-x265-params',
            'pools=none:frame-threads=1:log-level=error',
          );
        args.push('-pix_fmt', variant === 'hdr' ? 'yuv420p10le' : 'yuv420p');
        if (variant === 'hdr')
          args.push(
            '-color_primaries',
            'bt2020',
            '-color_trc',
            'smpte2084',
            '-colorspace',
            'bt2020nc',
          );
        args.push('-c:a', 'aac', input);
        await videoCommand(
          process.env.FFMPEG_PATH || 'ffmpeg',
          args,
          signal,
          30000,
        );
        let source = input;
        if (variant === 'rotated') {
          source = join(dir, 'rotated.mov');
          await videoCommand(
            process.env.FFMPEG_PATH || 'ffmpeg',
            [
              '-nostdin',
              '-v',
              'error',
              '-i',
              input,
              '-c',
              'copy',
              '-metadata:s:v:0',
              'rotate=90',
              source,
            ],
            signal,
            30000,
          );
        }
        const result = await convertVideo(source, output, poster, signal);
        assert.equal(result.remux, variant === 'h264');
        const probe = await probeVideo(output, signal);
        const video = probe.streams.find((s) => s.codec_type === 'video')!;
        assert.equal(video.codec_name, 'h264');
        assert.equal(video.pix_fmt, 'yuv420p');
        assert.equal(video.width, variant === 'rotated' ? 160 : 96);
        assert.equal(video.height, variant === 'rotated' ? 96 : 160);
        assert.equal(
          probe.streams.find((s) => s.codec_type === 'audio')?.codec_name,
          'aac',
        );
        assert.ok((await stat(poster)).size > 0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
