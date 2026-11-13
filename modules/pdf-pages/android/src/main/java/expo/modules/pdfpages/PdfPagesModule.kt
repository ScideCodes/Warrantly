package expo.modules.pdfpages

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

// In-app PDF viewing (brainstorm section 18) with Android's own PdfRenderer: each page becomes an
// image in the cache folder, so the app needs no PDF library. Runs off the main thread.
// Also: first-page thumbnails (cached by file, size and change time), a bounded page range for reading text
// on the phone, and small JPEGs of product photos for the home-screen widget.
class PdfPagesModule : Module() {
  private fun fileOf(fileUri: String) = File(Uri.parse(fileUri).path ?: throw Exception("Not a file: $fileUri"))

  private fun <T> withRenderer(source: File, block: (PdfRenderer) -> T): T {
    val fd = ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      val renderer = PdfRenderer(fd)
      try {
        return block(renderer)
      } finally {
        renderer.close()
      }
    } finally {
      fd.close()
    }
  }

  private fun renderPage(renderer: PdfRenderer, i: Int, width: Int): Bitmap {
    val page = renderer.openPage(i)
    try {
      val height = maxOf(1, width * page.height / maxOf(1, page.width))
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE) // pages without a background would render transparent
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      return bitmap
    } finally {
      page.close()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PdfPages")

    AsyncFunction("render") { fileUri: String, width: Int ->
      val context = appContext.reactContext ?: throw Exception("Android context is not available")
      val source = fileOf(fileUri)
      val out = File(context.cacheDir, "pdf-pages/${source.name}")
      out.deleteRecursively()
      out.mkdirs()
      withRenderer(source) { renderer ->
        (0 until renderer.pageCount).map { i ->
          val bitmap = renderPage(renderer, i, width)
          val file = File(out, "$i.png")
          FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
          val result = mapOf("uri" to Uri.fromFile(file).toString(), "width" to bitmap.width, "height" to bitmap.height)
          bitmap.recycle()
          result
        }
      }
    }

    // First page only, cached: the same file, width and change time reuse the PNG without opening the PDF.
    AsyncFunction("thumbnail") { fileUri: String, width: Int ->
      val context = appContext.reactContext ?: throw Exception("Android context is not available")
      val source = fileOf(fileUri)
      if (!source.exists()) throw Exception("missing")
      val dir = File(context.cacheDir, "pdf-thumbs")
      dir.mkdirs()
      val file = File(dir, "${source.name}-$width-${source.lastModified()}.png")
      if (!file.exists()) {
        withRenderer(source) { renderer ->
          if (renderer.pageCount == 0) throw Exception("empty")
          val bitmap = renderPage(renderer, 0, width)
          FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 90, it) }
          bitmap.recycle()
        }
      }
      val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, opts)
      mapOf("uri" to Uri.fromFile(file).toString(), "width" to opts.outWidth, "height" to opts.outHeight)
    }

    // At most `count` pages from `first`, as JPEGs for text recognition; the folder is replaced each call.
    AsyncFunction("renderForText") { fileUri: String, width: Int, first: Int, count: Int ->
      val context = appContext.reactContext ?: throw Exception("Android context is not available")
      val source = fileOf(fileUri)
      val out = File(context.cacheDir, "pdf-text")
      out.deleteRecursively()
      out.mkdirs()
      withRenderer(source) { renderer ->
        val pages = (first until minOf(renderer.pageCount, first + count)).map { i ->
          val bitmap = renderPage(renderer, i, width)
          val file = File(out, "$i.jpg")
          FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }
          bitmap.recycle()
          Uri.fromFile(file).toString()
        }
        mapOf("pageCount" to renderer.pageCount, "pages" to pages)
      }
    }

    // A square JPEG at most `size` pixels, as base64, for widgets (RemoteViews limit bitmap memory).
    AsyncFunction("smallJpeg") { fileUri: String, size: Int ->
      val source = fileOf(fileUri)
      if (!source.exists()) throw Exception("missing")
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(source.path, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw Exception("unreadable")
      var sample = 1
      while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= size) sample *= 2
      val decoded = BitmapFactory.decodeFile(source.path, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw Exception("unreadable")
      val side = minOf(decoded.width, decoded.height)
      val square = Bitmap.createBitmap(decoded, (decoded.width - side) / 2, (decoded.height - side) / 2, side, side)
      val scaled = Bitmap.createScaledBitmap(square, size, size, true)
      val bytes = ByteArrayOutputStream()
      scaled.compress(Bitmap.CompressFormat.JPEG, 82, bytes)
      if (scaled !== square) scaled.recycle()
      if (square !== decoded) square.recycle()
      decoded.recycle()
      Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
    }
  }
}
