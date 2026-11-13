import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidatesFrom, chooseCandidate, lookupKey, pictureFrom, searchQueries, type Candidate } from './productImage.ts';

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
  assert.deepEqual(got, [{ id: 'Q1', names: ['Samsung Galaxy S24', 'Galaxy S24'], description: 'smartphone model ', image: 'S24.jpg' }]);
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
