import concurrent.futures
import hashlib
import io
import json
import pathlib
import re
import urllib.request
import zipfile

PROJECT = pathlib.Path(__file__).resolve().parents[1]
CACHE = PROJECT / 'data/geonames-downloads'
CACHE.mkdir(parents=True, exist_ok=True)

def download(name):
    target = CACHE / name
    if target.exists():
        with zipfile.ZipFile(target) as archive:
            archive.getinfo('cities1000.txt' if name == 'cities1000.zip' else 'alternateNamesV2.txt')
        return target
    request = urllib.request.Request('https://download.geonames.org/export/dump/' + name, headers={'User-Agent': 'QuestKeeps-data-builder/1.0'})
    partial = target.with_suffix('.part')
    with urllib.request.urlopen(request, timeout=60) as response, partial.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    partial.rename(target)
    print('Downloaded ' + name, flush=True)
    return target

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    archives = list(pool.map(download, ['cities1000.zip', 'alternateNamesV2.zip']))

def key(country, lat, lng):
    return f'{country}|{float(lat):.5f}|{float(lng):.5f}'

cities = json.loads((PROJECT / 'node_modules/cities.json/cities.json').read_text(encoding='utf-8'))
indexed = {}
for city in cities:
    indexed.setdefault(key(city['country'], city['lat'], city['lng']), []).append(city)
records = {}
with zipfile.ZipFile(archives[0]) as archive:
    for line in io.TextIOWrapper(archive.open('cities1000.txt'), encoding='utf-8'):
        fields = line.rstrip('\r\n').split('\t')
        matches = indexed.get(key(fields[8], fields[4], fields[5]), [])
        # Exact coordinates + original name + country avoids translating a nearby namesake.
        matches = [city for city in matches if city['name'] in (fields[1], fields[2])]
        if matches:
            records[fields[0]] = {'keys': [f"{city['country']}|{city['name']}|{float(city['lat']):.5f}|{float(city['lng']):.5f}" for city in matches], 'native': fields[1], 'en': fields[2], 'labels': {}, 'rank': {}}

with zipfile.ZipFile(archives[1]) as archive:
    for line in io.TextIOWrapper(archive.open('alternateNamesV2.txt'), encoding='utf-8'):
        fields = line.rstrip('\r\n').split('\t')
        if len(fields) < 8 or fields[2] not in ('ru', 'en') or fields[1] not in records:
            continue
        if fields[7] == '1' or fields[6] == '1' or len(fields) > 9 and fields[9]:
            continue
        language, name = fields[2], fields[3]
        if language == 'ru' and not re.search('[А-Яа-яЁё]', name):
            continue
        record = records[fields[1]]
        rank = (10 if fields[4] == '1' else 0) - (1 if fields[5] == '1' else 0)
        if language not in record['rank'] or rank > record['rank'][language]:
            record['labels'][language] = name
            record['rank'][language] = rank

result = {}
for record in records.values():
    labels = {'en': record['labels'].get('en', record['en'])}
    ru = record['labels'].get('ru')
    if not ru and re.search('[А-Яа-яЁё]', record['native']):
        ru = record['native']
    if ru:
        labels['ru'] = ru
    for city_key in record['keys']:
        compact = dict(labels)
        if compact.get('en') == city_key.split('|')[1]:
            del compact['en']
        if compact:
            result[city_key] = compact
target = PROJECT / 'lib/data/place-names.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(json.dumps({'matchedCities': len(result), 'russianNames': sum('ru' in value for value in result.values()), 'bytes': target.stat().st_size, 'examples': {k: v for k, v in result.items() if any('|' + name + '|' in k for name in ('Moskovskiy', 'Solntsevo', 'Vnukovo', 'Konyaaltı', 'Antalya', 'Rome', 'Roma', 'Moscow'))}}, ensure_ascii=True), flush=True)
