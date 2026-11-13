import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidatesFrom, chooseCandidate, cutoutQuery, fileCandidates, firstWorking, lookupKey, LOOKUP_VERSION, needsLookup, photoChoices, pictureFrom, searchQueries, type Candidate } from './productImage.ts';

const c = (id: string, names: string[], description = 'smartphone model', image: string | null = `${id}.jpg`): Candidate => ({ id, names, description, image });

test('exact model with extra storage and colour words matches', () => {
  const pick = chooseCandidate('Samsung Galaxy S24 128GB fekete', [c('Q1', ['Samsung Galaxy S24']), c('Q2', ['Samsung Galaxy S24 Ultra'])]);
  assert.equal(pick?.id, 'Q1');
});

test('the longest contained model wins', () => {
  const pick = chooseCandidate('Samsung Galaxy S24 Ultra 256GB', [c('Q1', ['Samsung Galaxy S24']), c('Q2', ['Samsung Galaxy S24 Ultra'])]);
  assert.equal(pick?.id, 'Q2');
});

test('a variant the candidate lacks is never matched to the base model', () => {
  assert.equal(chooseCandidate('Apple iPhone 15 Pro', [c('Q1', ['iPhone 15'])]), null);
  assert.equal(chooseCandidate('Apple AirPods Pro 2', [c('Q1', ['AirPods Pro'], 'earbuds', 'a.jpg')]), null);
});

test('a "+" model is the Plus model, not a tie with the base model', () => {
  // Wikidata's real answer for "Samsung Galaxy S24" (2026-11): the S24 and the S24+ both carry pictures.
  const cands = [c('Q1', ['Samsung Galaxy S24']), c('Q2', ['Samsung Galaxy S24+']), c('Q3', ['Samsung Galaxy S24 FE'])];
  assert.equal(chooseCandidate('Samsung Galaxy S24 128GB', cands)?.id, 'Q1');
  assert.equal(chooseCandidate('Samsung Galaxy S24+ 256GB', cands)?.id, 'Q2');
});

test('a candidate with words the product lacks is not matched', () => {
  assert.equal(chooseCandidate('Apple iPhone 15', [c('Q1', ['iPhone 15 Plus']), c('Q2', ['iPhone 15 Pro'])]), null);
});

test('accessories, series, missing images and names without a model number are rejected', () => {
  assert.equal(chooseCandidate('iPhone 15 Pro case', [c('Q1', ['iPhone 15 Pro'])]), null);
  assert.equal(chooseCandidate('Samsung Galaxy S24 tok', [c('Q1', ['Samsung Galaxy S24'])]), null);
  assert.equal(chooseCandidate('Samsung Galaxy S24', [c('Q1', ['Samsung Galaxy S24'], 'line of high-end smartphones, series')]), null);
  assert.equal(chooseCandidate('Samsung Galaxy S24', [c('Q1', ['Samsung Galaxy S24'], 'smartphone model', null)]), null);
  assert.equal(chooseCandidate('Philips kettle', [c('Q1', ['Philips kettle'], 'kettle')]), null);
});

test('two different equally good candidates are a tie: no picture', () => {
  assert.equal(chooseCandidate('Logitech MX Master 3S', [c('Q1', ['Logitech MX Master 3S']), c('Q2', ['MX Master 3S Logitech'])]), null);
});

test('aliases and accents count', () => {
  assert.equal(chooseCandidate('Logitech MX Master 3S egér', [c('Q9', ['Some label', 'Logitech MX Master 3S'], 'mouse')])?.id, 'Q9');
});

test('lookup key follows the product name', () => {
  assert.equal(lookupKey('  Samsung  Galaxy S24!'), 'samsung galaxy s24');
  assert.equal(lookupKey('Kávéfőző X1'), 'kavefozo x1');
  assert.equal(lookupKey(''), null);
});

test('search queries drop trailing words, at most four', () => {
  assert.deepEqual(searchQueries('Samsung Galaxy S24 (128GB) black'), ['Samsung Galaxy S24 128GB black', 'Samsung Galaxy S24 128GB', 'Samsung Galaxy S24', 'Samsung Galaxy']);
  assert.deepEqual(searchQueries('Kettle'), []);
});

test('Wikidata entities become candidates', () => {
  const got = candidatesFrom(
    {
      Q1: { id: 'Q1', labels: { en: { value: 'Samsung Galaxy S24' } }, aliases: { en: [{ value: 'Galaxy S24' }] }, descriptions: { en: { value: 'smartphone model' } }, claims: { P18: [{ mainsnak: { datavalue: { value: 'S24.jpg' } } }] } },
    },
    ['Q1', 'Q404'],
  );
  assert.deepEqual(got, [{ id: 'Q1', names: ['Samsung Galaxy S24', 'Galaxy S24'], description: 'smartphone model', image: 'S24.jpg' }]);
  // Many items keep their name only as the multilingual ('mul') label.
  assert.deepEqual(candidatesFrom({ Q2: { id: 'Q2', labels: { mul: { value: 'PlayStation 5' } } } }, ['Q2'])[0].names, ['PlayStation 5']);
});

test('Commons image info gives a thumbnail and credit only with a licence', () => {
  const json = (license: string, thumb = 'https://upload.wikimedia.org/x/256px-S24.jpg') => ({
    query: { pages: { '1': { imageinfo: [{ thumburl: thumb, descriptionurl: 'https://commons.wikimedia.org/wiki/File:S24.jpg', extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: license } } }] } } },
  });
  assert.deepEqual(pictureFrom(json('CC BY-SA 4.0'), 'S24.jpg'), {
    thumb: 'https://upload.wikimedia.org/x/256px-S24.jpg',
    credit: { file: 'S24.jpg', page: 'https://commons.wikimedia.org/wiki/File:S24.jpg', artist: 'Jane Doe', license: 'CC BY-SA 4.0' },
  });
  assert.equal(pictureFrom(json(''), 'S24.jpg'), null);
  assert.equal(pictureFrom(json('CC0', 'https://example.com/a.jpg'), 'S24.jpg'), null);
  assert.equal(pictureFrom({}, 'S24.jpg'), null);
  // Commons now answers with thumbnails on thumb.wikimedia.org (seen 2026-11).
  const thumbHost = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/X.jpg/330px-X.jpg?utm_source=commons.wikimedia.org';
  assert.equal(pictureFrom(json('CC BY 4.0', thumbHost), 'X.jpg')?.thumb, thumbHost);
  assert.equal(pictureFrom(json('CC0', 'https://thumb.wikimedia.org.evil.com/a.jpg'), 'X.jpg'), null);
});

test('picture fallback: usable user photo, then matching found picture, then the category icon', () => {
  const w = { photo_path: 'photo-1.jpg', product_name: 'Logitech MX Master 3S', found_photo_key: 'logitech mx master 3s', found_photo_path: 'found-1.jpg' };
  const all = () => true;
  assert.deepEqual(photoChoices(w, all), [{ path: 'photo-1.jpg', found: false }, { path: 'found-1.jpg', found: true }]);
  // the user's photo file is gone: the found picture is still shown
  assert.deepEqual(photoChoices(w, (p) => p !== 'photo-1.jpg'), [{ path: 'found-1.jpg', found: true }]);
  // renamed product: the found picture belongs to the old name
  assert.deepEqual(photoChoices({ ...w, product_name: 'Logitech MX Anywhere 3' }, all), [{ path: 'photo-1.jpg', found: false }]);
  assert.deepEqual(photoChoices({ ...w, photo_path: null, found_photo_path: null }, all), []);
  // an image that fails to load (corrupt, unsupported) is skipped in order; all failed: icon
  const choices = photoChoices(w, all);
  assert.equal(firstWorking(choices, [])?.path, 'photo-1.jpg');
  assert.equal(firstWorking(choices, ['photo-1.jpg'])?.path, 'found-1.jpg');
  assert.equal(firstWorking(choices, ['photo-1.jpg', 'found-1.jpg']), null);
});

const page = (title: string, index: number, colorType = 'truecolour-alpha') => ({
  title: `File:${title}`,
  index,
  imageinfo: [{
    thumburl: `https://upload.wikimedia.org/thumb/${index}.png`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${index}`,
    metadata: [{ name: 'colorType', value: colorType }],
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Someone' } },
  }],
});
const search = (...pages: ReturnType<typeof page>[]) => ({ query: { pages: Object.fromEntries(pages.map((p) => [String(p.index), p])) } });

test('PNG files named after the exact model come first; variants, charts and opaque files are dropped', () => {
  const json = search(
    page('IPhone 15 pro.png', 1),
    page('Apple iPhone 15 transparent background.png', 2),
    page('IPhone 15 (Vector).png', 3),
    page('IPhone 15 机型价格 & 性能数据对比图.png', 4),
    page('IPhone 15 comparison chart.png', 5),
    page('Samsung Galaxy S24 (webtekno) 001.png', 6, 'truecolour'),
    page('IPhone 15 photo.jpg', 7),
  );
  assert.deepEqual(fileCandidates(json, 'Apple iPhone 15 128GB fekete', false).map((f) => f.credit.file), ['Apple iPhone 15 transparent background.png', 'IPhone 15 (Vector).png']);
});

test('files depicting the matched item are trusted without a name match, but never a variant', () => {
  const json = search(page('PlayStation 5 and DualSense with transparent background.png', 1), page('Nintendo Switch Lite representation.png', 2));
  assert.deepEqual(fileCandidates(json, 'Sony PlayStation 5 konzol', true).map((f) => f.credit.file), ['PlayStation 5 and DualSense with transparent background.png']);
  assert.deepEqual(fileCandidates(json, 'Nintendo Switch OLED', true).map((f) => f.credit.file), ['PlayStation 5 and DualSense with transparent background.png']);
  assert.deepEqual(fileCandidates(json, 'Sony PlayStation 5 konzol', false), []);
});

test('cut-out search uses the matched label, else brand and model', () => {
  assert.equal(cutoutQuery('Apple iPhone 15 128GB fekete', 'iPhone 15'), 'iPhone 15 filemime:image/png');
  assert.equal(cutoutQuery('Apple iPhone 15 128GB fekete okostelefon', null), 'Apple iPhone 15 filemime:image/png');
});

test('existing pictures are looked up again once after a lookup upgrade, never against the user', () => {
  const w = { product_name: 'Apple iPhone 15', photo_path: null, found_photo_key: 'apple iphone 15', found_photo_path: 'found-1.jpg', found_photo_credit: '{"file":"a.jpg"}' };
  const exists = () => true;
  assert.equal(needsLookup(w, exists), true); // found before cut-outs existed
  assert.equal(needsLookup({ ...w, found_photo_credit: `{"v":${LOOKUP_VERSION}}` }, exists), false);
  assert.equal(needsLookup({ ...w, found_photo_credit: null }, exists), true); // an old "no match"
  assert.equal(needsLookup({ ...w, found_photo_credit: 'removed' }, exists), false);
  assert.equal(needsLookup({ ...w, photo_path: 'photo-1.jpg' }, exists), false);
  assert.equal(needsLookup({ ...w, found_photo_credit: `{"v":${LOOKUP_VERSION}}` }, () => false), true); // file gone
});
