import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_PATH = './data/video-job-' + randomUUID() + '.sqlite';

process.env.TOKEN_ENCRYPTION_KEY = '78'.repeat(32);

const { db, run, encrypt } = await import('../lib/db');

const { videoStore, closeVideoStore, runVideoJob } =
  await import('../lib/video-jobs');

const { videoKey } = await import('../lib/video-store');

const { videoCommand, probeVideo } = await import('../lib/video-convert');

after(() => {
  closeVideoStore();
  db.close();
});

const available =
  spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], {
    stdio: 'ignore',
    windowsHide: true,
  }).status === 0;

test(
  'real queued HEVC is downloaded, converted and published; cancellation preserves a pending job',
  { skip: !available },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qk-video-job-'));
    const originalFetch = globalThis.fetch;
    try {
      const source = join(dir, 'source.mov');
      const signal = AbortSignal.timeout(60000);
      await videoCommand(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-filter_threads',
          '1',
          '-f',
          'lavfi',
          '-i',
          'color=c=red:s=160x96:r=12',
          '-t',
          '0.5',
          '-c:v',
          'libx265',
          '-threads',
          '1',
          '-x265-params',
          'pools=none:frame-threads=1:log-level=error',
          '-pix_fmt',
          'yuv420p',
          source,
        ],
        signal,
        30000,
      );
      const sourceBytes = await readFile(source);
      run(
        'INSERT INTO users VALUES (?,?,?,?,?)',
        'owner',
        'job@fixture.invalid',
        'Owner',
        null,
        Date.now(),
      );
      run(
        'INSERT INTO trips(id,owner_id,title,destination,start,end,created) VALUES (?,?,?,?,?,?,?)',
        'trip',
        'owner',
        'Job',
        '',
        '2026-10-10',
        '2026-10-18',
        Date.now(),
      );
      run(
        'INSERT INTO accounts(id,user_id,yandex_id,label,token,disk_enabled) VALUES (?,?,?,?,?,1)',
        'account',
        'owner',
        'fixture',
        'Fixture',
        encrypt('dummy'),
      );
      run(
        'INSERT INTO sources(id,trip_id,user_id,account_id,path,approved) VALUES (?,?,?,?,?,1)',
        'source',
        'trip',
        'owner',
        'account',
        'disk:/fixture',
      );
      run(
        'INSERT INTO media(id,source_id,trip_id,user_id,resource_id,path,name,mime,kind,taken,date_basis,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        'movie',
        'source',
        'trip',
        'owner',
        'resource',
        'disk:/fixture/a.mov',
        'a.mov',
        'video/quicktime',
        'video',
        '2026-10-13',
        'manual',
        '1',
      );
      let downloads = 0;
      globalThis.fetch = async (input) => {
        if (new URL(String(input)).hostname === 'cloud-api.yandex.net')
          return Response.json({
            href: 'https://downloader.disk.yandex.ru/file',
          });
        downloads++;
        return new Response(new Uint8Array(sourceBytes), {
          headers: { 'Content-Length': String(sourceBytes.length) },
        });
      };
      const media = {
        account_id: 'account',
        resource_id: 'resource',
        path: 'disk:/fixture/a.mov',
        revision: '1',
      };
      const key = videoKey(media);
      const cache = videoStore();
      cache.enqueue(key, 'movie');
      await runVideoJob(signal);
      assert.equal(cache.job(key)?.state, 'ready');
      assert.equal(downloads, 1);
      assert.equal(existsSync(cache.file(key, 'input')), false);
      assert.equal(
        (await probeVideo(cache.file(key, 'mp4'), signal)).streams[0]
          .codec_name,
        'h264',
      );
      assert.ok((await readFile(cache.file(key, 'jpg'))).length > 0);
      assert.deepEqual(
        await readFile(source),
        sourceBytes,
        'source original is unchanged',
      );
      run('UPDATE media SET revision=? WHERE id=?', '2', 'movie');
      const second = videoKey({ ...media, revision: '2' });
      cache.enqueue(second, 'movie');
      const abort = new AbortController();
      abort.abort();
      await runVideoJob(abort.signal);
      assert.equal(cache.job(second)?.state, 'pending');
      assert.equal(existsSync(cache.file(second, 'mp4')), false);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
