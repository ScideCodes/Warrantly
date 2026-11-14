// Release switches. Gmail import needs Google's verification of the restricted gmail.readonly scope;
// until then it stays hidden and no sign-in asks for it. The code is kept for when it is approved.
// A staging build turns it on with EXPO_PUBLIC_GMAIL_IMPORT=1 (for example to record Google's demo video);
// release builds never set it.
export const GMAIL_IMPORT = process.env.EXPO_PUBLIC_GMAIL_IMPORT === '1';
