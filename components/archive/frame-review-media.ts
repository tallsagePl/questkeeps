import { sampleFrame } from '../../lib/frame-review';

function videoEvent(
  video: HTMLVideoElement,
  event: 'loadedmetadata' | 'seeked',
  signal: AbortSignal,
  start: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const cleanup = () => {
      video.removeEventListener(event, success);
      video.removeEventListener('error', failure);
      signal.removeEventListener('abort', failure);
    };
    const success = () => {
      cleanup();
      resolve();
    };
    const failure = () => {
      cleanup();
      reject(new Error('Frame unavailable'));
    };
    video.addEventListener(event, success);
    video.addEventListener('error', failure);
    signal.addEventListener('abort', failure);
    try {
      start();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function readPhoto(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('image/')
  )
    throw new Error('Preview unavailable');
  const image = await createImageBitmap(await response.blob());
  try {
    return { frames: [sampleFrame(image)], pixels: image.width * image.height };
  } finally {
    image.close();
  }
}

export async function readVideo(url: string, signal: AbortSignal) {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  try {
    await videoEvent(video, 'loadedmetadata', signal, () => {
      video.src = url;
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth)
      throw new Error('Video unavailable');
    const frames = [];
    for (const fraction of [0.2, 0.5, 0.8]) {
      await videoEvent(video, 'seeked', signal, () => {
        video.currentTime = duration * fraction;
      });
      frames.push(sampleFrame(video));
    }
    return { frames, duration, pixels: video.videoWidth * video.videoHeight };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}
