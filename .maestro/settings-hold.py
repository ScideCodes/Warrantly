"""Hold regression on an English disposable Android emulator, with Settings open.
Install uiautomator2 (includes Pillow), then run this file. Optional --backup also
checks the frequency picker; backup must already be enabled in the test fixture.
The test restores the initial appearance/frequency selections.
"""
import argparse
import time
from PIL import ImageChops
import uiautomator2 as u2

parser = argparse.ArgumentParser()
parser.add_argument('--device', default='emulator-5554')
parser.add_argument('--backup', action='store_true')
args = parser.parse_args()
device = u2.connect(args.device)


def radio(label):
    return device(description=label, className='android.widget.RadioButton')


def find(label, down=True):
    for direction in [down, not down]:
        for _ in range(8):
            if radio(label).exists:
                return
            device.swipe(0.5, 0.75 if direction else 0.3, 0.5, 0.3 if direction else 0.75, 0.25)
    raise AssertionError(f'Could not find {label}')


def hold(label):
    option = radio(label)
    before = bool(device(description=label, checked=True).exists)
    x, y = option.center()
    box = (int(x - 90), int(y - 30), int(x + 90), int(y + 30))
    device.touch.down(x, y)
    try:
        time.sleep(0.7)  # Ignore initial press feedback; sample the sustained hold.
        first = device.screenshot().crop(box)
        for _ in range(6):
            time.sleep(0.3)
            frame = device.screenshot().crop(box)
            assert ImageChops.difference(first, frame).getbbox() is None, f'{label} blinked while held'
        assert bool(device(description=label, checked=True).exists) == before, 'Selection changed before release'
    finally:
        device.touch.up(x, y)
    assert device(description=label, checked=True).wait(timeout=10)


if device(resourceId='tab-settings').wait(timeout=2):
    device(resourceId='tab-settings').click()
find('English', down=False)
hold('English')
find('Auto', down=False)
original = next(label for label in ['Light', 'Dark', 'Auto'] if device(description=label, checked=True).exists)
try:
    hold('Light' if original == 'Dark' else 'Dark')
finally:
    radio(original).click()
print('Selected language and unselected appearance holds stayed steady')

if args.backup:
    find('Monthly')
    width, height = device.window_size()
    if radio('Monthly').center()[1] > height * 0.55:
        device.swipe(width * 0.5, height * 0.75, width * 0.5, height * 0.4, 0.25)
    original = next(label for label in ['Weekly', 'Monthly', '3 months', '6 months'] if device(description=label, checked=True).exists)
    target = 'Weekly' if original == 'Monthly' else 'Monthly'
    try:
        hold(target)
        hold(target)
        for label in ['6 months', 'Weekly', 'Monthly']:
            radio(label).click()
            assert device(description=label, checked=True).wait(timeout=5)
    finally:
        radio(original).click()
    print('Backup holds and repeated selections passed')
