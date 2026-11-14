// Provider-neutral message shape (brainstorm section 15): Gmail, Outlook and IMAP
// adapters all convert into this, so the parser never knows where mail came from.
export interface MailMessage {
  id: string;
  from: string; // sender address, e.g. "segito@alza.hu"
  fromName?: string; // display name, e.g. "Alza.hu"
  to: string[]; // recipients, used to avoid mistaking the user's own address for store contact
  subject: string;
  date: string; // ISO 8601 timestamp the mail was sent
  text: string; // plain-text body (HTML already converted)
  attachments: { filename: string; mimeType: string; id?: string }[]; // id: provider attachment id for download
}

export type Kind = 'purchase' | 'return' | 'ignored';
export type Status = 'complete' | 'needs_input' | 'ignored';
export type RequiredField = 'productName' | 'warrantyMonths';

export interface Item {
  name: string;
  warrantyMonths: number | null;
  warrantySource: 'email' | 'store_rule' | null;
}

export interface ParseResult {
  messageId: string;
  subject: string; // kept as the warranty's source (section 12 "sources")
  sender: string;
  receivedAt: string; // ISO timestamp
  kind: Kind;
  // purchase: complete or needs_input. return: always needs_input (user picks Delete or Keep).
  status: Status;
  storeName: string;
  storeDomain: string;
  purchaseDate: string; // YYYY-MM-DD, explicit body date when available, otherwise the mail's local date
  deliveredDate: string | null; // set when the mail says the goods arrived or were picked up
  suggestedStartDate: string; // delivery date if known, else purchase date (section 8)
  orderNumber: string | null;
  items: Item[]; // one warranty record per item (section 11)
  missingFields: RequiredField[];
  suggestedWarrantyMonths: number | null; // shown as "suggested" when length is missing
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string;
  pdfAttachments: string[]; // filenames for the PDF step (pdf.js), not parsed here
}

// Remembered per-store choice (section 8 "Remember choices"), keyed by store domain.
export type StoreRules = Record<string, { defaultWarrantyMonths: number }>;
