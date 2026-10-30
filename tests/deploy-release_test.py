"""Exercise release failure/success paths with fake commands; never contact Docker or production."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest

OLD = "sha256:" + "1" * 64
NEW = "sha256:" + "2" * 64
FAKE = r"""#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
p=Path(os.environ['QK_FAKE_STATE']);s=json.loads(p.read_text());a=sys.argv[1:];cmd=Path(sys.argv[0]).name
s['events'].append([cmd]+a);p.write_text(json.dumps(s))
def finish(value='',code=0):
 p.write_text(json.dumps(s));print(value);sys.exit(code)
if cmd=='node':finish(code=1 if s['scenario']=='assets-fail' and os.environ.get('HEALTH_ASSET_BASE') else 0)
if cmd!='docker':finish()
if a[:2]==['image','inspect']:finish(s['new'])
if a[:2]==['container','inspect']:finish(code=0 if a[2] in s['containers'] else 1)
if a[0]=='inspect':
 name=a[-1];c=s['containers'].get(name)
 if not c:finish(code=1)
 f=a[2]
 if 'RestartCount' in f:finish('0')
 if 'Health.Status' in f:finish('healthy')
 if 'State.Running' in f:finish(str(c['running']).lower())
 if '.Image' in f:finish(c['image'])
 if 'Labels' in f:finish('questkeeps')
 finish(code=1)
if a[0]=='run':
 if '--rm' in a:finish('12')
 name=a[a.index('--name')+1]
 if s['scenario']=='worker-fail' and 'worker' in name:finish(code=1)
 if s['scenario']=='video-fail' and 'video' in name:finish(code=1)
 s['containers'][name]={'running':True,'image':s['new']};finish(name)
if a[0]=='rm':
 name=a[-1]
 if name not in s['containers']:finish(code=1)
 if s['containers'][name]['running'] and '-f' not in a:finish(code=1)
 del s['containers'][name];finish(name)
if a[0]=='stop':s['containers'][a[-1]]['running']=False;finish()
if a[0]=='start':s['containers'][a[-1]]['running']=True;finish()
if a[0]=='cp':finish()
if a[:2]==['image','ls']:finish('\n'.join(s['images']))
if a[:2]==['image','rm']:
 image=a[-1]
 if any(c['image']==image for c in s['containers'].values()):finish(code=1)
 s['images'].remove(image);finish()
finish(code=1)
"""


@unittest.skipIf(os.name == "nt", "POSIX release scripts are verified on Linux")
class ReleaseTests(unittest.TestCase):
    def run_release(self, scenario):
        with tempfile.TemporaryDirectory(prefix="qk-release-fixture-") as folder:
            root = Path(folder)
            tools = root / "docker-tools"
            tools.mkdir()
            state = root / "docker-state"
            state.mkdir()
            (root / "shared/data").mkdir(parents=True)
            db = sqlite3.connect(root / "shared/data/travel.sqlite")
            db.execute("PRAGMA user_version=12")
            db.close()
            upstream = root / "upstream.conf"
            upstream.write_text("upstream questkeeps_backend {\n    server 127.0.0.1:3102;\n}\n")
            (state / "active-slot").write_text("green")
            (state / "active-image").write_text(OLD)
            source = Path(__file__).parents[1] / "deploy"
            for name in ["docker-release.sh", "docker-retire.sh"]:
                text = (source / name).read_text().replace("/opt/questkeeps", str(root))
                text = text.replace("/etc/nginx/conf.d/questkeeps-upstream.conf", str(upstream))
                text = text.replace("/var/www/questkeeps-assets", str(root / "assets"))
                text = text.replace("/usr/local/bin/node", "node")
                (tools / name).write_text(text)
            (tools / "database-backup.py").write_text("print('{}')")
            binaries = root / "bin"
            binaries.mkdir()
            for command in ["docker", "node", "nginx", "systemctl", "sleep"]:
                path = binaries / command
                path.write_text(FAKE)
                path.chmod(0o700)
            fake_state = root / "fake.json"
            fake_state.write_text(json.dumps({"old": OLD, "new": NEW, "scenario": scenario,
                "images": [OLD, NEW], "events": [], "containers": {
                  "qk-web-green": {"running": True, "image": OLD},
                  "qk-worker-green": {"running": True, "image": OLD},
                  "qk-video-green": {"running": True, "image": OLD}}}))
            if scenario == "first-video":
                initial = json.loads(fake_state.read_text())
                initial["containers"].pop("qk-video-green")
                fake_state.write_text(json.dumps(initial))
            result = subprocess.run(["bash", str(tools / "docker-release.sh"), "questkeeps:test"],
                env={**os.environ, "PATH": str(binaries) + os.pathsep + os.environ['PATH'], "QK_FAKE_STATE": str(fake_state)},
                capture_output=True, text=True, timeout=30)
            return result, json.loads(fake_state.read_text()), (state / "active-image").read_text().strip()

    def test_failed_assets_keep_previous_image_and_active_services(self):
        result, state, active = self.run_release("assets-fail")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(OLD, state['images'])
        self.assertTrue(state['containers']['qk-web-green']['running'])
        self.assertTrue(state['containers']['qk-worker-green']['running'])
        self.assertEqual(active, OLD)

    def test_failed_worker_restores_previous_services_without_retiring_image(self):
        result, state, active = self.run_release("worker-fail")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(OLD, state['images'])
        self.assertTrue(state['containers']['qk-web-green']['running'])
        self.assertTrue(state['containers']['qk-worker-green']['running'])
        self.assertEqual(active, OLD)

    def test_failed_video_restores_previous_video_worker(self):
        result, state, active = self.run_release("video-fail")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(OLD, state['images'])
        self.assertTrue(state['containers']['qk-video-green']['running'])
        self.assertEqual(active, OLD)

    def test_first_video_worker_can_be_added_without_a_previous_video_container(self):
        result, state, active = self.run_release("first-video")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(state['containers']['qk-video-blue']['running'])
        self.assertEqual(active, NEW)

    def test_success_retires_old_image_only_after_checks(self):
        result, state, active = self.run_release("success")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(state['images'], [NEW])
        self.assertEqual(active, NEW)
        self.assertTrue(state['containers']['qk-web-blue']['running'])
        self.assertTrue(state['containers']['qk-worker-blue']['running'])
        removal = next(i for i,e in enumerate(state['events']) if e[:3]==['docker','image','rm'])
        self.assertTrue(any(e[0]=='node' for e in state['events'][:removal]))


if __name__ == "__main__":
    unittest.main()
