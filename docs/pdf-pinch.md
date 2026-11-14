# PDF pinch zoom

The viewer supports continuous 100–300% pinch zoom around the two-finger focal point,
one-finger horizontal/vertical panning, and vertical fling scrolling. The toolbar remains
available and updates its percentage when the pinch ends. Zooming back to fit resets
horizontal pan. Save and Share continue using the original PDF.

`PdfCanvas` keeps pages at fit-width layout in a virtualized FlatList. Gestures transform
the viewport and drive native scroll offsets on the UI thread; they do not re-render
React, resize every page, or decode PDF bitmaps on every frame. Exact page layouts keep
virtualization accurate for mixed page sizes. A viewport-sized footer supplies the native
scroll range needed to reach the final page at higher zoom, while explicit gesture bounds
prevent exposing that spacer. Geometry is tested separately in `pdfViewport.test.ts`.

Gesture Handler 3.5.0 was already installed through Expo Router and compiled into the
existing Android build. It is now an explicit dependency at that same version, so this
change is compatible with the existing 0.8.1 OTA runtime.

Verification: 113 unit tests; lint and typecheck; actual two-pointer Android emulator
gestures at intermediate and maximum zoom; pinch back to fit; toolbar buttons; panning
and scrolling a three-page PDF to its last page and back to the first. The reproducible
gesture check is `.maestro/pdf-pinch.py` (requires uiautomator2 and a PDF already open).
Physical-device, iOS and screen-reader behavior have not been verified.
