#!/usr/bin/env python3
"""Generate a small, non-secret manifest for the tested CI image."""
import hashlib,json,os,pathlib,subprocess,re
archive=pathlib.Path('questkeeps-image.tar.gz')
tag=os.environ['QK_TAG']; revision=os.environ['QK_COMMIT']
assert re.fullmatch(r'questkeeps:[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]{7}',tag)
assert re.fullmatch(r'[a-f0-9]{40}',revision)
image=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]
assert image['Config']['Labels']['org.opencontainers.image.revision']==revision
h=hashlib.sha256()
with archive.open('rb') as stream:
 for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
print(json.dumps({'tag':tag,'revision':revision,'imageId':image['Id'],'sha256':h.hexdigest(),'bytes':archive.stat().st_size}))
