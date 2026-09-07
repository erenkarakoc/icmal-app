import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ProjectRegistry} from '../desktop/src/project-registry.ts';

async function alan() {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'icmal-kayit-'));
 const dosya = path.join(dir, 'yerel-projeler.json');
 const proje = async (ad) => {
  const p = path.join(dir, ad);
  await fs.writeFile(p, 'x');
  return p;
 };
 return {dir, dosya, proje, kayit: () => new ProjectRegistry(dosya)};
}

test('kayit uygulama yeniden baslatildiginda korunur', async () => {
 const {dosya, proje, kayit} = await alan();
 const a = await proje('butce.icmal');
 await kayit().remember(a);
 // Yeni ornek = yeniden baslatilmis uygulama.
 const {projects} = await kayit().list();
 assert.equal(projects.length, 1);
 assert.equal(projects[0].path, a);
 assert.equal(projects[0].missing, false);
 assert.ok(JSON.parse(await fs.readFile(dosya, 'utf8')).projects.length === 1);
});

test('ayni dosya iki kez eklenmez ve kimligini korur', async () => {
 const {proje, kayit} = await alan();
 const a = await proje('butce.icmal');
 const k = kayit();
 const ilk = await k.remember(a);
 const ikinci = await k.remember(a.toUpperCase());
 assert.equal(ikinci.id, ilk.id, 'ayni dosya icin kimlik degismemeli');
 const {projects} = await k.list();
 assert.equal(projects.length, 1);
});

test('en son kullanilan basa gelir', async () => {
 const {proje, kayit} = await alan();
 const a = await proje('a.icmal'), b = await proje('b.icmal');
 const k = kayit();
 await k.remember(a); await k.remember(b); await k.remember(a);
 const {projects} = await k.list();
 assert.deepEqual(projects.map(p => path.basename(p.path)), ['a.icmal', 'b.icmal']);
});

test('silinmis dosya eksik isaretlenir ama listede kalir', async () => {
 const {proje, kayit} = await alan();
 const a = await proje('butce.icmal');
 const k = kayit();
 await k.remember(a);
 await fs.rm(a);
 const {projects} = await k.list();
 assert.equal(projects.length, 1);
 assert.equal(projects[0].missing, true);
});

test('listeden kaldirmak diskteki dosyayi silmez', async () => {
 const {proje, kayit} = await alan();
 const a = await proje('butce.icmal');
 const k = kayit();
 const girdi = await k.remember(a);
 assert.equal(await k.forget(girdi.id), true);
 assert.equal((await k.list()).projects.length, 0);
 assert.ok(await fs.stat(a), 'dosya diskte durmali');
 assert.equal(await k.forget(girdi.id), false, 'ikinci kaldirma yok demeli');
});

test('tasinmis dosya yeniden secilince ayni girdi guncellenir', async () => {
 const {proje, kayit} = await alan();
 const a = await proje('butce.icmal');
 const k = kayit();
 const girdi = await k.remember(a);
 const yeni = await proje('tasinmis.icmal');
 const sonuc = await k.relocate(girdi.id, yeni);
 assert.equal(sonuc.id, girdi.id, 'kimlik korunmali');
 assert.equal(sonuc.path, yeni);
 const {projects} = await k.list();
 assert.equal(projects.length, 1);
 assert.equal(projects[0].missing, false);
});

test('yeniden secim listedeki baska bir girdiyle cakisirsa kopya olusmaz', async () => {
 const {proje, kayit} = await alan();
 const a = await proje('a.icmal'), b = await proje('b.icmal');
 const k = kayit();
 const ga = await k.remember(a);
 await k.remember(b);
 await k.relocate(ga.id, b);
 const {projects} = await k.list();
 assert.equal(projects.length, 1, 'ayni dosyaya iki girdi kalmamali');
 assert.equal(projects[0].path, b);
});

test('bozuk kayit dosyasi uygulamayi durdurmaz, hatayi bildirir', async () => {
 const {dosya, proje, kayit} = await alan();
 await fs.writeFile(dosya, '{bozuk json');
 const k = kayit();
 const {projects, fault} = await k.list();
 assert.deepEqual(projects, []);
 assert.ok(fault, 'okuma hatasi bildirilmeli');
 // Bozuk dosyaya ragmen calisma surer ve sonraki kayit yazilir.
 const a = await proje('butce.icmal');
 await k.remember(a);
 assert.equal((await kayit().list()).projects.length, 1);
});

test('kayittaki gecersiz satirlar atilir, gecerliler korunur', async () => {
 const {dosya, kayit} = await alan();
 await fs.writeFile(dosya, JSON.stringify({projects: [
  {path: 'C:/x/a.icmal', name: 'a', id: '1', openedAt: '2026-01-01T00:00:00.000Z'},
  {path: 'C:/x/rapor.pdf', name: 'pdf', id: '2'},
  {ad: 'yolsuz'},
  {path: 'C:/x/a.icmal', name: 'kopya', id: '3'},
 ]}));
 const {projects} = await kayit().list();
 assert.equal(projects.length, 1);
 assert.equal(projects[0].id, '1');
});

test('yazilamayan kayitta oturum ici liste calismaya devam eder', async () => {
 const {dir, proje} = await alan();
 // Kayit yolu bir dizin: yazma her zaman basarisiz olur.
 const k = new ProjectRegistry(path.join(dir, 'engel'));
 await fs.mkdir(path.join(dir, 'engel'), {recursive: true});
 const a = await proje('butce.icmal');
 await k.remember(a);
 const {projects, fault} = await k.list();
 assert.equal(projects.length, 1, 'oturum ici liste kullanilabilir kalmali');
 assert.ok(fault, 'yazma hatasi bildirilmeli');
});
