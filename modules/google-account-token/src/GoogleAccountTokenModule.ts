import { NativeModule, requireNativeModule } from 'expo';

declare class GoogleAccountTokenModule extends NativeModule<Record<string, never>> {
  // Rejects with code CONSENT_REQUIRED when the account must be signed in again.
  getToken(email: string, scopes: string[]): Promise<string>;
}

export default requireNativeModule<GoogleAccountTokenModule>('GoogleAccountToken');
