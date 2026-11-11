import type { TFunction } from 'i18next';

// Claim helper (brainstorm section 20): a draft to the store in the app language, opened in the phone's
// mail app. mailto needs no extra permission or native module; the user reviews and sends it.
// shortcut: mailto cannot attach files; attach the invoice PDF once PDFs are stored (build step 4).
export interface ClaimInput {
  product: string;
  purchaseDate: string; // already formatted for display
  endDate: string;
  orderNumber: string | null;
  serialNumber: string | null;
  name: string | null;
}

export function claimEmail(t: TFunction, c: ClaimInput): { subject: string; body: string } {
  const lines = [
    t('claim.greeting'),
    '',
    t('claim.intro'),
    '',
    `${t('claim.product')}: ${c.product}`,
    `${t('claim.purchaseDate')}: ${c.purchaseDate}`,
    c.orderNumber && `${t('claim.orderNumber')}: ${c.orderNumber}`,
    c.serialNumber && `${t('claim.serialNumber')}: ${c.serialNumber}`,
    `${t('claim.validUntil')}: ${c.endDate}`,
    '',
    `${t('claim.problem')}:`,
    t('claim.problemPlaceholder'),
    '',
    t('claim.thanks'),
    c.name ?? '',
  ];
  return { subject: t('claim.subject', { product: c.product }), body: lines.filter((l): l is string => typeof l === 'string').join('\n') };
}

export const mailtoUrl = (to: string, subject: string, body: string): string =>
  `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
