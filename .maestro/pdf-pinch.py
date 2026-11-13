"""Two-finger regression check. Install uiautomator2, open a synthetic PDF in the
emulator's viewer, then run: python .maestro/pdf-pinch.py [emulator-5554].
No files are saved or shared; the test only changes the viewer's zoom.
"""
import sys
import time
import uiautomator2 as u2

device = u2.connect(sys.argv[1] if len(sys.argv) > 1 else 'emulator-5554')
canvas = device(resourceId='pdf-canvas')
assert canvas.wait(timeout=20), 'Open a PDF in Warrantly first'
for _ in range(3):
    if device(text='100%').exists:
        break
    device(description='Zoom out').click()
    time.sleep(0.3)
assert device(text='100%').wait(timeout=5)
canvas.pinch_out(percent=70, steps=40)
assert device(text='300%').wait(timeout=5), 'Pinch out did not reach the upper bound'
canvas.pinch_in(percent=90, steps=40)
assert device(text='100%').wait(timeout=5), 'Pinch in did not return to fit'
device(description='Zoom in').click()
assert device(text='200%').wait(timeout=5)
device(description='Zoom out').click()
assert device(text='100%').wait(timeout=5)
print('Two-finger zoom limits and toolbar buttons passed')
