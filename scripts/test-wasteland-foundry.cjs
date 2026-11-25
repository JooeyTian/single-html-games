// Run: node scripts/test-wasteland-foundry.cjs
// Exercise the actual inline simulation without a browser or third-party dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../apps/wasteland-foundry/index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source); // Parse the entire shipped script, including rendering and UI handlers.
const stub = () => ({ textContent: '', hidden: false, style: {}, replaceChildren() {}, close() {} });
const context = vm.createContext({
  console, performance, Date, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: stub, createElement: stub, createTextNode: String, body: { classList: { add(){}, remove(){}, contains(){return false;} } } }
});
vm.runInContext(source.split('// Low-cost procedural factory illustration.')[0], context);
vm.runInContext('render = () => {}; log = () => {}; toast = () => {};', context);
const run = script => vm.runInContext(script, context);
const data = script => JSON.parse(JSON.stringify(run(script)));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('starting cash builds a complete line without clicking for resources', () => {
  run('state=fresh(); [1,2,3].forEach(i=>buy(i,"1")); simulate(60);');
  assert.deepEqual(data('state.levels'), [1,1,1,1]);
  near(run('state.cash'), 240);
  near(run('state.totalProduced'), 30);
  assert.equal(run('validSave(state)'), true);
});
test('materials are conserved and finite warehouses stop production', () => {
  run('state=fresh(); simulate(1000);');
  near(run('state.stock[0]'), 200);
  near(run('state.runValue'), 0);
  run('state=fresh(); state.levels=[5,2,1,0]; simulate(3600);');
  assert.ok(run('state.stock.every((n,i)=>n>=0&&n<=capacities()[i]+1e-8)'));
  near(run('state.stock[2]'), 100);
});
test('steel orders sell ingots, pause assembly and preserve finished stock', () => {
  run('state=fresh(); state.levels=[1,1,1,1]; state.order="steel"; state.stock[2]=5; state.projectActive=true; simulate(60);');
  near(run('state.cash'), 280);
  near(run('state.stock[2]'), 5);
  near(run('state.totalProduced'), 0);
  near(run('state.progress'), 0);
});
test('project allocation conserves parts and claims each reward once', () => {
  run('state=fresh(); state.levels=[1,1,1,1]; state.projectActive=true; simulate(480);');
  near(run('state.progress'), 60);
  near(run('state.totalProduced'), 240);
  near(run('state.cash'), 1540); // 180 sold parts + starting funds.
  assert.equal(run('state.projectActive'), false);
  run('claimProject();');
  assert.equal(run('state.chapter'), 1);
  assert.equal(run('state.blueprints[0]'), true);
  near(run('state.cash'), 2440);
  run('claimProject();');
  near(run('state.cash'), 2440);
});
test('all three chapters complete, final reward is idempotent', () => {
  run('state=fresh(); for(let i=0;i<3;i++){state.progress=CHAPTERS[state.chapter].need;claimProject();}');
  assert.equal(run('state.chapterClaimed'), true);
  assert.deepEqual(data('state.blueprints'), [true,true,true]);
  near(run('state.cash'), 163000);
  run('claimProject();');
  near(run('state.cash'), 163000);
  assert.equal(run('validSave(state)'), true);
});
test('live and offline steps produce identical results with automatic buying', () => {
  run('state=fresh(); state.levels=[2,1,1,1]; state.tech.auto=1; state.autoBuy=true; state.projectActive=true; autoClock=0; const seed=JSON.stringify(state); simulate(600); const live=JSON.stringify(state); state=JSON.parse(seed); autoClock=0; simulate(600,true);');
  assert.equal(run('JSON.stringify(state)===live'), true);
});
test('offline cap limits earnings and does not claim project rewards', () => {
  run('state=fresh(); state.levels=[1,1,1,1]; state.projectActive=true; state.lastSeen=Date.now()-48*3600000; const offlineResult=catchUp();');
  near(run('offlineResult.seconds'), 43200);
  assert.equal(run('offlineResult.limited'), true);
  near(run('state.progress'), 60);
  assert.equal(run('state.chapter'), 0);
  assert.equal(run('validSave(state)'), true);
});
test('specialization and milestones change production and pricing', () => {
  run('state=fresh(); state.levels=[10,10,10,10]; const normal=rate(1); state.specs=[0,0,1,1];');
  near(run('rate(1)/normal'), 1.8);
  near(run('price()'), 8*1.6*1.4);
  near(run('rate(0)'), 2*10*2*1.7);
});
test('migration resets ordinary progress and preserves permanent investment', () => {
  run('state=fresh(); state.runValue=100000; state.cores=3; state.totalCores=5; state.tech.starter=1; state.blueprints=[true,true,false]; state.storage=3; state.specs=[0,-1,-1,-1]; state.levels=[10,1,1,1]; doPrestige();');
  assert.equal(run('state.cores'), 5);
  assert.equal(run('state.totalCores'), 7);
  assert.equal(run('state.run'), 2);
  assert.deepEqual(data('state.levels'), [3,3,3,3]);
  assert.deepEqual(data('state.specs'), [-1,-1,-1,-1]);
  assert.deepEqual(data('state.blueprints'), [true,true,false]);
  assert.equal(run('state.cash'), 350);
  assert.equal(run('state.runValue'), 0);
  assert.equal(run('state.storage'), 0);
  assert.equal(run('validSave(state)'), true);
});
test('save validation rejects corrupt, missing, negative and oversized fields', () => {
  for (const change of ['x.cash=-1','x.levels=[1,2]','x.levels[0]=501','x.tech.auto=9','x.progress=9999','delete x.stock','x.lastSeen=Infinity','x.cores=999','x.order="unknown"','x.specs[1]=0']) {
    assert.equal(run(`(()=>{const x=fresh();${change};return validSave(x)})()`), false, change);
  }
  assert.equal(run('validSave(JSON.parse(JSON.stringify(fresh())))'), true);
});
console.log(`\n${passed} simulation checks passed.`);
