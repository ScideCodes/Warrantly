package expo.modules.pdfpages

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

// In-app PDF viewing (brainstorm section 18) with Android's own PdfRenderer: each page becomes an
// image in the cache folder, so the app needs no PDF library. Runs off the main thread.
class PdfPagesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfPages")

    AsyncFunction("render") { fileUri: String, width: Int ->
      val context = appContext.reactContext ?: throw Exception("Android context is not available")
      val source = File(Uri.parse(fileUri).path ?: throw Exception("Not a file: $fileUri"))
      val out = File(context.cacheDir, "pdf-pages/${source.name}")
      out.deleteRecursively()
      out.mkdirs()

      val fd = ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY)
      val renderer = PdfRenderer(fd)
      try {
        (0 until renderer.pageCount).map { i ->
          val page = renderer.openPage(i)
          try {
            val height = width * page.height / page.width
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE) // pages without a background would render transparent
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val file = File(out, "$i.png")
            FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
            mapOf("uri" to Uri.fromFile(file).toString(), "width" to width, "height" to height)
          } finally {
            page.close()
          }
        }
      } finally {
        renderer.close()
        fd.close()
      }
    }
  }
}
