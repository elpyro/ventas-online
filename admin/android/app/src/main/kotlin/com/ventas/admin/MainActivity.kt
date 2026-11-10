package com.ventas.admin

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import androidx.core.content.FileProvider

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ventas/share_whatsapp").setMethodCallHandler { call, result ->
            if (call.method == "shareToWhatsApp") {
                val filePath = call.argument<String>("filePath") ?: ""
                val phone = call.argument<String>("phone") ?: ""
                val text = call.argument<String>("text") ?: ""
                val ok = shareToWhatsApp(filePath, phone, text)
                result.success(ok)
            } else {
                result.notImplemented()
            }
        }
    }

    private fun shareToWhatsApp(filePath: String, phone: String, text: String): Boolean {
        if (filePath.isEmpty()) return false
        val file = File(filePath)
        if (!file.exists()) return false
        val pm: PackageManager = packageManager
        val whatsappInstalled = try {
            pm.getPackageInfo("com.whatsapp", 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
        if (!whatsappInstalled) return false
        val uri: Uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            setPackage("com.whatsapp")
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, text)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (phone.isNotEmpty()) {
                val digits = phone.filter { it.isDigit() }
                if (digits.isNotEmpty()) {
                    putExtra("jid", "$digits@s.whatsapp.net")
                }
            }
        }
        return try {
            startActivity(Intent.createChooser(intent, "Enviar por WhatsApp").apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
            true
        } catch (e: Exception) {
            false
        }
    }
}
