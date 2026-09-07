import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreCostRows, storeCostRows, restorePercentageRows, storePercentageRows, storeGiderler, restoreGiderler} from '../src/features/projects/lib/row-adapters.ts';
import {createProject,encodeProject,decodeProject} from '../src/features/projects/lib/icmal-file.ts';
const item={id:'a',pozNo:'15.001',description:'İnşaat',unit:'m³',quantity:'3.000000000000000000123',unitPrice:'12.34567890123456789'};
test('Decimal rows survive file export/open without display rounding',async()=>{
 const project=createProject('Proje');project.costRows=storeCostRows(restoreCostRows([item]));
 const reopened=restoreCostRows((await decodeProject(await encodeProject(project))).costRows);
 assert.equal(reopened[0].quantity.toFixed(),item.quantity);assert.equal(reopened[0].unitPrice.toFixed(),item.unitPrice);
 assert.equal(reopened[0].rowNumber,1);assert.equal(reopened[0].fromDatabase,false);
});
test('percentage inputs survive and derived costs are recalculated',()=>{
 const stored={...item,quantity:'3',unitPrice:'100',percentageLow:'10',percentageHigh:'20',useRange:true};
 const rows=restorePercentageRows([stored]);assert.equal(rows[0].estimatedCost.toFixed(),'2000');assert.deepEqual(storePercentageRows(rows),[stored]);
});
test('unsupported missing price rejects whole load without mutating input',()=>{
 const data=[item,{...item,id:'b',unitPrice:null}];const before=structuredClone(data);
 assert.throws(()=>restoreCostRows(data),/eksik fiyat/);assert.deepEqual(data,before);
});

test('gider gidis-donusu ad ve turleri korur',()=>{
 const giderler=[
  {id:'s1',ad:'Şantiye kurulumu',tur:'tutar',deger:'100000'},
  {id:'g1',ad:'Genel gider',tur:'yuzde',deger:'10',tabanGiderleri:['s1']},
 ];
 const geri=restoreGiderler(storeGiderler(giderler));
 assert.deepEqual(geri,giderler,'ad, tur, deger ve taban secimi birebir donmeli');
});

test('tabani olmayan gider dosyaya bos dizi yazmaz',()=>{
 const yazilan=storeGiderler([{id:'a',ad:'Sabit',tur:'tutar',deger:'5'}]);
 assert.equal('baseExpenseIds' in yazilan[0],false,'gereksiz alan yazilmamali');
 assert.equal(restoreGiderler(yazilan)[0].tabanGiderleri,undefined);
});
