# Stable settings holds and backup selection motion

Static themed buttons no longer update their React press/hover state or rewrite CSS
transition duration just because a finger is held down. Existing explicit press
callbacks still run, including navigation icon feedback.

Setting selectors now use native Pressable touch targets and one separate decorative
selection lens. The targets stay still and retain one steady pressed opacity. Holding
does not change the selected setting; release commits it once. Selecting the current
value does nothing, avoiding redundant language/theme/backup work. Removing overlapping
vertical hit slop also keeps adjacent grid rows' touch areas distinct.

The lens moves between measured cells with a 180ms ease-out transform transition on
the UI thread. The same component serves backup frequency, theme and language. It
supports the existing one-row, 2x2 and large-text column layouts. Reduced motion
changes the duration to zero. No layout dimensions or touch targets animate per frame.

Verification: typecheck, lint (existing i18next import warning only), 127 unit tests;
Android API 37 emulator holds on the Settings navigation tab, selected language,
unselected appearance and both selected/unselected backup options. Screenshot samples
after initial press feedback stayed identical during sustained holds, and the selected
radio value changed only after release. Rapid repeated frequency selections passed.
Selection also passed in the 360dp-wide, 2x text single-column layout.
An Android recording sampled at 30fps showed intermediate lens positions during
normal motion; with reduced motion enabled it showed only the endpoints.

The original continuous blinking was not reproduced in the initial emulator sample.
The change removes press-driven animation rewrites from the affected controls and
adds a repeatable regression check: install uiautomator2/Pillow and run
`python .maestro/settings-hold.py` on English Settings in a disposable emulator.
Use `--backup` when backup is already enabled in that test fixture. Selections are
restored afterwards. Physical-device release feel and iOS were not measured.
