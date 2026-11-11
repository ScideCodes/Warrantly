// Web is only used for screen previews: no app lock there.
export const isLockEnabled = (): boolean => false;
export const storedPinLength = (): number => 4;
export const setPin = (_pin: string): void => {};
export const clearLock = async (): Promise<void> => {};
export const waitSeconds = (): number => 0;
export const checkPin = (_pin: string): boolean => true;
export const biometricAvailable = async (): Promise<boolean> => false;
export const isBiometricEnabled = (): boolean => false;
export const setBiometricEnabled = (_on: boolean): void => {};
export const unlockWithBiometrics = async (_prompt: string, _cancel: string): Promise<boolean> => false;
export const hasDeviceLock = async (): Promise<boolean> => false;
export const verifyDeviceOwner = async (_prompt: string): Promise<boolean> => false;
