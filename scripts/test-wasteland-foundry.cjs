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
  near(run('state.cash'), 300);
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
  near(run('state.cash'), 340);
  near(run('state.stock[2]'), 5);
  near(run('state.totalProduced'), 0);
  near(run('state.progress'), 0);
});
test('project allocation conserves parts and claims each reward once', () => {
  run('state=fresh(); state.levels=[1,1,1,1]; state.projectActive=true; simulate(480);');
  near(run('state.progress'), 60);
  near(run('state.totalProduced'), 240);
  near(run('state.cash'), 2020); // 180 sold parts + starting funds + 480 seconds of relief.
  assert.equal(run('state.projectActive'), false);
  run('claimProject();');
  assert.equal(run('state.chapter'), 1);
  assert.equal(run('state.blueprints[0]'), true);
  near(run('state.cash'), 2920);
  run('claimProject();');
  near(run('state.cash'), 2920);
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
test('legacy saves migrate without changing money, equipment or progress', () => {
  run('state=fresh(); state.cash=4321; state.levels=[12,10,8,9]; state.version=1; delete state.city; const oldSave=JSON.parse(JSON.stringify(state));');
  assert.equal(run('validSave(oldSave)'),true);
  run('state=migrateSave(oldSave);');
  assert.equal(run('state.cash'),4321);
  assert.deepEqual(data('state.levels'),[12,10,8,9]);
  assert.equal(run('state.version'),2);
  assert.equal(run('validSave(state)'),true);
});
test('engineering charges once, enforces prerequisites and finishes on time', () => {
  run('state=fresh();state.cash=10000;');
  assert.equal(run('startEngineering("split")'),false,'basic line required');
  run('state.levels=[1,1,1,1];');
  assert.equal(run('startEngineering("robots")'),false,'sorter required');
  assert.equal(run('startEngineering("split")'),true);
  assert.equal(run('state.cash'),9760);
  assert.equal(run('startEngineering("split")'),false,'no double charge');
  assert.equal(run('startEngineering("sorter")'),false,'one construction at a time');
  run('simulate(7.75);');
  assert.equal(run('hasCity("split")'),false);
  run('simulate(.25);');
  assert.equal(run('hasCity("split")'),true);
  assert.equal(run('state.city.construction'),null);
  assert.equal(run('startEngineering("split")'),false,'cannot rebuy');
});
test('second line assembles while main line is selling steel', () => {
  run('state=fresh();state.levels=[1,1,1,1];state.order="steel";state.city.built=["split"];simulate(60);');
  assert.ok(run('state.totalProduced')>0);
  assert.ok(run('state.city.lane[2]')>0);
  assert.ok(run('state.city.income.factory')>180);
  assert.equal(run('validSave(state)'),true);
});
test('salvage arrivals are periodic and warehouse limited', () => {
  run('state=fresh();state.city.built=["salvage"];simulate(19.75);');
  assert.equal(run('state.city.lastConvoy'),0);
  run('simulate(.25);');
  assert.equal(run('state.city.lastConvoy'),80);
  run('simulate(1000);');
  assert.ok(run('state.stock[0]<=capacities()[0]'));
});
test('electronics create separate revenue and waste heat needs operating furnaces', () => {
  run('state=fresh();state.levels=[1,1,1,1];state.city.built=["sorter","heat"];simulate(60);');
  assert.ok(run('state.city.income.chips')>0);
  assert.ok(run('state.city.income.power')>0);
  assert.ok(run('state.city.waste>=0&&state.city.chips>=0'));
  run('state=fresh();state.city.built=["heat"];simulate(60);');
  assert.equal(run('state.city.income.power'),0,'no magic electricity');
});
test('robots consume real materials and stop at the worker cap', () => {
  run('state=fresh();state.city.built=["sorter","robots"];state.city.robotParts=8;state.city.chips=8;simulate(8);');
  assert.equal(run('state.city.robots'),2);
  near(run('state.city.robotParts'),0);
  near(run('state.city.robotProgress'),0);
  run('state.city.robots=63;state.city.robotParts=16;state.city.chips=10;simulate(30);');
  assert.equal(run('state.city.robots'),64);
  near(run('state.city.robotParts'),12);
  assert.equal(run('validSave(state)'),true);
  run('state=fresh();state.city.built=["sorter","robots"];state.city.robotMode="sell";state.city.robotParts=8;state.city.chips=8;simulate(10);');
  assert.equal(run('state.city.robots'),0);
  assert.equal(run('state.city.robotParts'),8);
  assert.ok(run('state.city.income.chips')>0);
});
test('railway books cargo once and pays in scheduled batches', () => {
  run('state=fresh();state.city.built=["split","rail"];deliverGoods(100);');
  near(run('state.cash'),140);
  near(run('state.city.trainValue'),60);
  run('simulate(14.75);');
  near(run('state.city.income.rail'),0);
  run('simulate(.25);');
  near(run('state.city.income.rail'),150);
  near(run('state.city.trainValue'),0);
  run('simulate(15);');
  near(run('state.city.income.rail'),150,'empty train pays nothing');
});
test('crawler recovers ruins every thirty seconds and creates salvage income', () => {
  run('state=fresh();state.city.built=["sorter","robots","split","rail","crawler"];state.city.robotMode="sell";simulate(29.75);');
  assert.equal(run('state.city.ruins'),0);
  run('simulate(.25);');
  assert.equal(run('state.city.ruins'),1);
  near(run('state.city.income.ruins'),300);
  assert.equal(run('validSave(state)'),true);
});
test('all city systems including construction match online and offline simulation', () => {
  run('state=fresh();state.levels=[10,10,10,10];state.cash=100000;state.city.built=ENGINEERING.filter(p=>p.id!=="crawler").map(p=>p.id);startEngineering("crawler");const citySeed=JSON.stringify(state);simulate(900);const cityLive=JSON.stringify(state);state=JSON.parse(citySeed);simulate(900,true);');
  assert.equal(run('JSON.stringify(state)===cityLive'),true);
  assert.equal(run('validSave(state)'),true);
  assert.equal(run('state.city.robots'),64);
  assert.ok(run('state.city.ruins')>20);
});
test('migration keeps old-city dividends but resets construction and new industries', () => {
  run('state=fresh();state.levels=[10,10,10,10];state.city.built=["sorter"];simulate(600);state.runValue=100000;const expectedArchive=state.city.revenue/state.city.elapsed*.15;doPrestige();');
  near(run('state.city.archive'),run('expectedArchive'));
  assert.deepEqual(data('state.city.built'),[]);
  assert.equal(run('state.city.robots'),0);
  const before=run('state.cash');run('simulate(60);');
  near(run('state.cash')-before,(run('expectedArchive')+1)*60);
  assert.equal(run('validSave(state)'),true);
});
test('city save validation rejects impossible projects, timers and worker counts', () => {
  for(const change of ['x.city.built=["unknown"]','x.city.built=["rail"]','x.city.built=["split","split"]','x.city.robots=65','x.city.waste=-1','x.city.trainClock=15','x.city.income.rail=NaN','x.city.construction={id:"split",remaining:999}','delete x.city']){
    assert.equal(run(`(()=>{const x=fresh();${change};return validSave(x)})()`),false,change);
  }
});
test('startup reserves missing hardware costs against repeated and bulk upgrades', () => {
  for(const mode of ['1','10','max']){
    run('state=fresh();');
    for(let n=0;n<10;n++)run(`buy(0,'${mode}')`);
    assert.equal(run('state.cash'),100);
    assert.equal(run('state.levels[0]'),1);
    run(`buy(1,'${mode}');buy(2,'${mode}');buy(3,'${mode}');`);
    assert.deepEqual(data('state.levels'),[1,1,1,1]);
    assert.equal(run('state.cash'),0);
    run('simulate(30);');
    assert.ok(run('state.cash')>0);
  }
});
test('stranded saves can receive hardware aid once without generating value', () => {
  run('state=fresh();state.cash=3;state.levels=[4,0,0,0];');
  assert.equal(run('rescueStartup()'),true);
  assert.deepEqual(data('state.levels'),[4,1,1,1]);
  assert.equal(run('state.cash'),0);
  assert.equal(run('state.runValue'),0);
  assert.equal(run('rescueStartup()'),false);
  run('simulate(30);');
  assert.ok(run('state.cash')>0);
  run('state=fresh();');
  assert.equal(run('rescueStartup()'),false,'funded starts do not need aid');
});
test('fixed relief pays one per second online and offline without affecting industrial value', () => {
  run('state=fresh();state.cash=0;state.levels=[0,0,0,0];simulate(60);');
  near(run('state.cash'),60);
  near(run('state.runValue'),0);
  near(run('state.totalValue'),0);
  near(run('state.city.revenue'),0);
  run('state=fresh();state.cash=0;state.levels=[0,0,0,0];simulate(60,true);');
  near(run('state.cash'),60);
});
console.log(`\n${passed} simulation checks passed.`);
