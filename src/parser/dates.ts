import { isValidYmd } from '../warranty.ts';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Hungarian abbreviations ("jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec.")
  febr: 2, márc: 3, ápr: 4, máj: 5, jún: 6, júl: 7, szept: 9, okt: 10,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  január: 1, február: 2, március: 3, április: 4, május: 5, június: 6,
  július: 7, augusztus: 8, szeptember: 9, október: 10,
};

const ymd = (y: number, m: number, d: number) =>
  y >= 2000 && isValidYmd(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;

// Prefer a labeled purchase/receipt date, skip deadlines and expiry dates, then use the
// first valid past date. Email parsing requires a label; scanned receipts may be unlabeled.
export function findDate(text: string, today: string, labeledOnly = false): string | null {
  const found: { date: string | null; at: number }[] = [];
  for (const m of text.matchAll(/\b(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\b/g)) found.push({ date: ymd(+m[1], +m[2], +m[3]), at: m.index });
  for (const m of text.matchAll(/\b(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(20\d{2})\b/g)) found.push({ date: ymd(+m[3], +m[2], +m[1]), at: m.index });
  for (const m of text.matchAll(/\b([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]{3,10})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/g)) found.push({ date: ymd(+m[3], MONTHS[m[1].toLowerCase()] ?? 0, +m[2]), at: m.index });
  for (const m of text.matchAll(/\b(20\d{2})\.\s*([a-záéíóöőúüű]{3,10})\.?\s*(\d{1,2})\b/gi)) found.push({ date: ymd(+m[1], MONTHS[m[2].toLowerCase()] ?? 0, +m[3]), at: m.index });
  return found.map(f => {
    const prefix = text.slice(Math.max(0, f.at - 80), f.at);
    const excluded = /(?:payment due|due date|pay by|warranty (?:ends|expires)|expiry(?: date)?|expiration(?: date)?|delivery date|fizetési határidő|garancia vége|jótállás vége|lejárat(?: dátuma)?|szállítás dátuma)\s*[:：-]?\s*$/i.test(prefix);
    const labeled = /(?:purchase date|order date|date of purchase|purchased on|vásárlás(?: dátuma| időpontja)?|rendelés dátuma|teljesítés(?: dátuma)?|kelt|dátum|date)\s*[:：-]?\s*$/i.test(prefix);
    return { ...f, excluded, labeled };
  }).filter(f => f.date && f.date <= today && !f.excluded && (!labeledOnly || f.labeled))
    .sort((a, b) => Number(b.labeled) - Number(a.labeled) || a.at - b.at)[0]?.date ?? null;
}

// Labeled start/delivery date for warranties (e.g. installation, delivery, activation).
export function findWarrantyStartDate(text: string, today: string): string | null {
  const found: { date: string | null; at: number }[] = [];
  for (const m of text.matchAll(/\b(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\b/g)) found.push({ date: ymd(+m[1], +m[2], +m[3]), at: m.index });
  for (const m of text.matchAll(/\b(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(20\d{2})\b/g)) found.push({ date: ymd(+m[3], +m[2], +m[1]), at: m.index });
  for (const m of text.matchAll(/\b([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]{3,10})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/g)) found.push({ date: ymd(+m[3], MONTHS[m[1].toLowerCase()] ?? 0, +m[2]), at: m.index });
  for (const m of text.matchAll(/\b(20\d{2})\.\s*([a-záéíóöőúüű]{3,10})\.?\s*(\d{1,2})\b/gi)) found.push({ date: ymd(+m[1], MONTHS[m[2].toLowerCase()] ?? 0, +m[3]), at: m.index });

  return found.map(f => {
    const prefix = text.slice(Math.max(0, f.at - 100), f.at);
    const labeled = /(?:garancia\s*kezdete|jótállás\s*kezdete|érvényesség\s*kezdete|kezdete|start\s*date|warranty\s*start|(?:beüzemelés|üzembe\s*helyezés|átvétel|teljesítés|delivery|szállítás)(?:\s*dátuma|\s*időpontja|\s*napja|\s*date)?)\s*[:：-]?\s*$/i.test(prefix);
    return { ...f, labeled };
  }).filter(f => f.date && f.date <= today && f.labeled)
    .sort((a, b) => a.at - b.at)[0]?.date ?? null;
}

