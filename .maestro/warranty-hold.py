"""Native hold regression. Run on a disposable emulator with a named warranty on the home screen.

Requires Pillow. Example: python .maestro/warranty-hold.py --device emulator-5556 --product 'Row hold fixture'
Checks that long-press selects once (release must not toggle it off) and that sustained row/document
button feedback stays visually still. Cancels selection and the document-button gesture afterward.
"""
import argparse
import io
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('--device', default='emulator-5556')
parser.add_argument('--product', default='Row hold fixture')
args = parser.parse_args()
adb = [os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe'), '-s', args.device]


def run(*parts):
    return subprocess.check_output(adb + list(parts))


def nodes():
    output = run('shell', 'uiautomator', 'dump', '/sdcard/warrantly-hold.xml')
    if b'dumped' not in output:
        return []  # A cold start may not have an accessibility root yet; do not read a stale dump.
    return list(ET.fromstring(run('shell', 'cat', '/sdcard/warrantly-hold.xml')).iter('node'))


def find(predicate):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        match = next((n for n in nodes() if predicate(n.attrib)), None)
        if match is not None:
            return match
        time.sleep(0.3)
    raise AssertionError('Expected control was not visible; open the fixture on the home screen')


def bounds(n):
    return tuple(map(int, re.findall(r'\d+', n.attrib['bounds'])))


def center(n):
    x1, y1, x2, y2 = bounds(n)
    return (x1 + x2) // 2, (y1 + y2) // 2


def motion(kind, point):
    run('shell', 'input', 'motionevent', kind, *map(str, point))


def image(box):
    return Image.open(io.BytesIO(run('exec-out', 'screencap', '-p'))).convert('RGB').crop(box)


def steady(box):
    time.sleep(0.7)
    first = image(box)
    for _ in range(6):
        time.sleep(0.2)
        assert ImageChops.difference(first, image(box)).getbbox() is None, 'Pressed surface blinked'


def selected_once():
    assert any(re.search(r'Actions for 1 item\b', n.attrib.get('text', '')) for n in nodes()), 'Release toggled selection off'


row = find(lambda a: a.get('content-desc', '').startswith(args.product + ','))
point = center(row)
motion('DOWN', point)
try:
    time.sleep(0.8)
    held = find(lambda a: a.get('content-desc', '').startswith(args.product + ','))
    steady(bounds(held))
finally:
    motion('UP', point)
selected_once()
# Holding an already selected row must not toggle it either.
point = center(find(lambda a: a.get('content-desc', '').startswith(args.product + ',')))
motion('DOWN', point)
try:
    steady(bounds(find(lambda a: a.get('content-desc', '').startswith(args.product + ','))))
finally:
    motion('UP', point)
selected_once()
run('shell', 'input', 'tap', *map(str, center(find(lambda a: a.get('content-desc') == 'Done selecting'))))
time.sleep(0.4)
button = find(lambda a: a.get('content-desc') == 'Add a document to ' + args.product)
point = center(button)
motion('DOWN', point)
try:
    steady(bounds(button))
finally:
    motion('MOVE', (5, 5))
    motion('UP', (5, 5))
print('PASS: repeated long holds select once; row and document-button feedback stays steady')
