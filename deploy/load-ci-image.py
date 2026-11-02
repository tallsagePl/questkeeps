#!/usr/bin/env python3
"""Stream a short-lived GitHub artifact URL into Docker; never store account credentials.

Read {url, sha256, bytes, tag, imageId, revision} from stdin. Obtain the URL only
after authorizing the download. This imports an image but never deploys it.
"""
import hashlib,json,re,subprocess,sys,urllib.request,urllib.parse
manifest=json.load(sys.stdin)
url=urllib.parse.urlparse(manifest['url'])
assert not url.username and not url.password and not url.port
assert url.scheme=='https' and url.hostname and (url.hostname.endswith('.blob.core.windows.net') or url.hostname.endswith('.actions.githubusercontent.com'))
assert re.fullmatch(r'[a-f0-9]{64}',manifest['sha256'])
assert re.fullmatch(r'questkeeps:[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{7}',manifest['tag'])
assert re.fullmatch(r'sha256:[a-f0-9]{64}',manifest['imageId'])
assert re.fullmatch(r'[a-f0-9]{40}',manifest['revision'])
assert 0<manifest['bytes']<2*1024**3
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
hash=hashlib.sha256(); total=0
process=subprocess.Popen(['docker','load'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with opener.open(manifest['url'],timeout=60) as response:
  for chunk in iter(lambda:response.read(1024*1024),b''):
   total+=len(chunk)
   if total>manifest['bytes']:raise RuntimeError('Artifact exceeds expected size')
   hash.update(chunk);process.stdin.write(chunk)
 process.stdin.close()
 if process.wait(timeout=600)!=0:raise RuntimeError('Docker import failed')
 assert total==manifest['bytes'] and hash.hexdigest()==manifest['sha256'], 'Artifact digest mismatch; image must not be run'
 image=json.loads(subprocess.check_output(['docker','image','inspect',manifest['tag']]))[0]
 assert image['Id']==manifest['imageId'] and image['Config']['Labels']['org.opencontainers.image.revision']==manifest['revision']
 print(json.dumps({'verified':True,'tag':manifest['tag'],'bytes':total}))
except BaseException:
 process.kill();process.wait();raise SystemExit('CI artifact import failed; production was not switched')
