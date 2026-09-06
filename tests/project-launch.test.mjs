import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {documentPathFromArgv,handoverKind} from '../desktop/src/project-launch.ts';

test('a packaged launch picks up the double-clicked file',()=>{
 assert.equal(documentPathFromArgv(['C:\App\İcmal.exe','C:\isler\butce.icmal']),
  path.resolve('C:\isler\butce.icmal'));
});

test('a development launch skips the script path',()=>{
 assert.equal(documentPathFromArgv(['electron','.','butce.icmal']),path.resolve('butce.icmal'));
});

test('switches are not mistaken for a file',()=>{
 assert.equal(documentPathFromArgv(['İcmal.exe','--inspect','--user-data-dir=x']),null);
});

test('an unrelated file is ignored',()=>{
 assert.equal(documentPathFromArgv(['İcmal.exe','rapor.pdf']),null);
});

test('the extension match is case insensitive',()=>{
 assert.equal(documentPathFromArgv(['İcmal.exe','BUTCE.ICMAL']),path.resolve('BUTCE.ICMAL'));
});

test('a plain launch hands over nothing',()=>{
 assert.equal(documentPathFromArgv(['İcmal.exe']),null);
});

test('an .ekap file is handed over as well',()=>{
 assert.equal(documentPathFromArgv(['İcmal.exe','C:\isler\teklif.ekap']),
  path.resolve('C:\isler\teklif.ekap'));
});

test('each extension reports its own kind',()=>{
 assert.equal(handoverKind('butce.icmal'),'icmal');
 assert.equal(handoverKind('TEKLIF.EKAP'),'ekap');
 assert.equal(handoverKind('rapor.pdf'),null);
});
