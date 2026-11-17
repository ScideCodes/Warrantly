package expo.modules.googleaccounttoken

import android.accounts.Account
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Access token for a specific Google account on the phone (brainstorm section 15: several Gmail
// accounts). The sign-in library only issues tokens for its last signed-in user; this asks Android's
// AuthorizationClient for any account that already granted the scopes, without showing UI.
class GoogleAccountTokenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GoogleAccountToken")

    AsyncFunction("getToken") { email: String, scopes: List<String>, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "Android context is not available", null)
        return@AsyncFunction
      }
      val request = AuthorizationRequest.builder()
        .setRequestedScopes(scopes.map { Scope(it) })
        .setAccount(Account(email, "com.google"))
        .build()
      Identity.getAuthorizationClient(context)
        .authorize(request)
        .addOnSuccessListener { result ->
          val token = result.accessToken
          // A resolution means Google wants to show consent: the user must reconnect this account.
          if (result.hasResolution() || token == null) {
            // No email in the message: it lands in the error log that feedback mails can carry.
            promise.reject("CONSENT_REQUIRED", "Google needs you to reconnect this account", null)
          } else {
            promise.resolve(token)
          }
        }
        .addOnFailureListener { e -> promise.reject("AUTHORIZE_FAILED", e.message ?: "Authorization failed", e) }
    }
  }
}
