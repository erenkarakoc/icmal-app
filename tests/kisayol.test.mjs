import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * `useKeyboardShortcuts` bir React kancasi oldugu icin dogrudan cagrilamiyor;
 * burada eslesme mantiginin AYNISI test ediliyor. Amac gerilemeyi yakalamak:
 * `key` tanimsiz gelen bir olay uygulamayi cokertmemeli.
 */
function eslesir(olay, kisayol) {
  if (typeof olay.key !== 'string') return false;
  const basilan = olay.key.toLowerCase();
  const ctrl = kisayol.ctrl ? olay.ctrlKey || olay.metaKey : !olay.ctrlKey && !olay.metaKey;
  const shift = kisayol.shift ? olay.shiftKey : !olay.shiftKey;
  const alt = kisayol.alt ? olay.altKey : !olay.altKey;
  const tus = typeof kisayol.key === 'string' && basilan === kisayol.key.toLowerCase();
  return ctrl && shift && alt && tus;
}

const olay = (o = {}) => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

test('key tanimsiz gelen olay cokertmez', () => {
  // Otomatik doldurma ve IME bilesimi boyle olaylar uretiyor; eskiden burada
  // "Cannot read properties of undefined (reading 'toLowerCase')" aliniyordu.
  assert.doesNotThrow(() => eslesir(olay({ key: undefined }), { key: 's', ctrl: true }));
  assert.equal(eslesir(olay({ key: undefined }), { key: 's', ctrl: true }), false);
});

test('kisayolun tusu tanimsizsa o kayit atlanir', () => {
  assert.equal(eslesir(olay({ key: 's', ctrlKey: true }), { key: undefined, ctrl: true }), false);
});

test('ctrl+s eslesir, buyuk kucuk harf onemsiz', () => {
  assert.equal(eslesir(olay({ key: 'S', ctrlKey: true }), { key: 's', ctrl: true }), true);
});

test('cmd de ctrl sayilir', () => {
  assert.equal(eslesir(olay({ key: 's', metaKey: true }), { key: 's', ctrl: true }), true);
});

test('istenmeyen degistirici eslesmeyi bozar', () => {
  assert.equal(
    eslesir(olay({ key: 's', ctrlKey: true, shiftKey: true }), { key: 's', ctrl: true }),
    false,
  );
});
