import { spawn } from 'node:child_process';
import { stat, open } from 'node:fs/promises';
import { VIDEO_DURATION_LIMIT, VIDEO_OUTPUT_LIMIT } from './video-store';

export class VideoFailure extends Error {
  constructor(
    public key:
      | 'video.failed'
      | 'video.unsupported'
      | 'video.tooLarge'
      | 'video.tooLong'
      | 'video.storageBusy',
  ) {
    super(key);
  }
}

const inputs = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  'mov,matroska,webm',
  '-probesize',
  '8388608',
  '-analyzeduration',
  '5000000',
];

export function videoCommand(
  binary: string,
  args: string[],
  signal: AbortSignal,
  timeoutMs = 600000,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let output = '';
    let bytes = 0;
    let expired = false;
    const stop = () => child.kill('SIGKILL');
    const timer = setTimeout(() => {
      expired = true;
      stop();
    }, timeoutMs);
    signal.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > 524288) stop();
      else output += data.toString('utf8');
    });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (signal.aborted) reject(signal.reason);
      else if (code !== 0 || expired || bytes > 524288)
        reject(new VideoFailure('video.failed'));
      else resolve(output);
    });
  });
}

export type VideoProbe = {
  streams: {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    pix_fmt?: string;
    color_transfer?: string;
    sample_aspect_ratio?: string;
    side_data_list?: { rotation?: number }[];
  }[];
  format: { duration: string };
};

export async function probeVideo(
  file: string,
  signal: AbortSignal,
): Promise<VideoProbe> {
  const raw = await videoCommand(
    process.env.FFPROBE_PATH || 'ffprobe',
    [
      ...inputs,
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,pix_fmt,color_transfer,sample_aspect_ratio:stream_side_data=rotation',
      '-of',
      'json',
      file,
    ],
    signal,
    30000,
  );
  return JSON.parse(raw);
}

export function conversionPlan(probe: VideoProbe) {
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  const duration = Number(probe.format.duration);
  if (
    !video ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !video.width ||
    !video.height ||
    video.width * video.height > 40000000
  )
    throw new VideoFailure('video.unsupported');
  if (duration > VIDEO_DURATION_LIMIT) throw new VideoFailure('video.tooLong');
  const hdr = ['smpte2084', 'arib-std-b67'].includes(
    video.color_transfer || '',
  );
  const rotated = video.side_data_list?.some(
    (item) => Math.abs(item.rotation || 0) % 360 !== 0,
  );
  const native =
    !rotated &&
    video.codec_name === 'h264' &&
    video.pix_fmt === 'yuv420p' &&
    (!audio || audio.codec_name === 'aac') &&
    !hdr &&
    Math.min(video.width, video.height) <= 720 &&
    Math.max(video.width, video.height) <= 1280 &&
    (!video.sample_aspect_ratio || video.sample_aspect_ratio === '1:1');
  const filters = [
    "scale=w='if(gte(iw,ih),min(iw,1280),min(iw,720))':h='if(gte(iw,ih),min(ih,720),min(ih,1280))':force_original_aspect_ratio=decrease:force_divisible_by=2",
  ];
  if (hdr)
    filters.push(
      'zscale=transfer=linear:npl=100',
      'format=gbrpf32le',
      'tonemap=tonemap=hable:desat=0',
      'zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=tv',
    );
  filters.push('format=yuv420p', 'setsar=1');
  return { duration, native, filter: filters.join(',') };
}

export async function convertVideo(
  input: string,
  output: string,
  poster: string,
  signal: AbortSignal,
) {
  const plan = conversionPlan(await probeVideo(input, signal));
  const args = [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-max_alloc',
    '67108864',
    '-threads',
    '1',
    ...inputs,
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
  ];
  if (plan.native) args.push('-c', 'copy');
  else
    args.push(
      '-filter_threads',
      '1',
      '-vf',
      plan.filter,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-maxrate',
      '2200k',
      '-bufsize',
      '4400k',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-ac',
      '2',
    );
  args.push(
    '-movflags',
    '+faststart',
    '-fs',
    String(VIDEO_OUTPUT_LIMIT),
    '-f',
    'mp4',
    output,
  );
  await videoCommand(process.env.FFMPEG_PATH || 'ffmpeg', args, signal);
  const result = await probeVideo(output, signal);
  const video = result.streams.find((s) => s.codec_type === 'video');
  const audio = result.streams.find((s) => s.codec_type === 'audio');
  if (
    video?.codec_name !== 'h264' ||
    video.pix_fmt !== 'yuv420p' ||
    (audio && audio.codec_name !== 'aac') ||
    Math.abs(Number(result.format.duration) - plan.duration) > 2
  )
    throw new VideoFailure('video.failed');
  if ((await stat(output)).size > VIDEO_OUTPUT_LIMIT)
    throw new VideoFailure('video.tooLarge');
  const fd = await open(output, 'r');
  try {
    const header = Buffer.alloc(65536);
    const read = await fd.read(header, 0, header.length, 0);
    if (!header.subarray(0, read.bytesRead).includes(Buffer.from('moov')))
      throw new VideoFailure('video.failed');
  } finally {
    await fd.close();
  }
  await videoCommand(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-threads',
      '1',
      ...inputs,
      '-i',
      output,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-filter_threads',
      '1',
      '-vf',
      'scale=640:640:force_original_aspect_ratio=decrease',
      '-q:v',
      '3',
      '-f',
      'image2',
      poster,
    ],
    signal,
    30000,
  );
  if ((await stat(poster)).size > 2 * 1024 * 1024)
    throw new VideoFailure('video.failed');
  return { remux: plan.native, duration: plan.duration };
}
