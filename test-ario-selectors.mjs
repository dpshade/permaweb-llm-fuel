import { JSDOM } from 'jsdom';

const url = 'https://docs.ar.io/sdks/ar-io-sdk';

console.log('Fetching:', url, '\n');

const response = await fetch(url);
const html = await response.text();
const dom = new JSDOM(html);
const doc = dom.window.document;

console.log('=== Testing Current Selectors ===\n');

const currentSelectors = ['article', 'main', '.content', '[role="main"]'];

for (const selector of currentSelectors) {
  const el = doc.querySelector(selector);
  const text = el?.textContent?.trim() || '';
  console.log(`${selector.padEnd(20)}: ${text.length.toString().padStart(6)} chars ${el ? '✓' : '✗'}`);
}

console.log('\n=== Testing Alternative Selectors ===\n');

const alternativeSelectors = [
  'body',
  '#__next',
  '.nextra-content',
  '[data-content]',
  '.prose',
  '[role="document"]',
  'div[class*="content"]',
  'div[class*="main"]'
];

for (const selector of alternativeSelectors) {
  const el = doc.querySelector(selector);
  const text = el?.textContent?.trim() || '';
  console.log(`${selector.padEnd(25)}: ${text.length.toString().padStart(6)} chars ${el ? '✓' : '✗'}`);
}

console.log('\n=== Top 20 Classes by Frequency ===\n');
const classCount = {};
doc.querySelectorAll('[class]').forEach(el => {
  el.className.split(' ').forEach(c => {
    if (c) classCount[c] = (classCount[c] || 0) + 1;
  });
});
Object.entries(classCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([cls, count]) => console.log(`  ${cls.padEnd(40)} (${count})`));
