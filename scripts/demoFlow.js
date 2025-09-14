// scripts/demoFlow.js  (overwrite)
require('dotenv').config();
const hre = require('hardhat');
const fetch = require('node-fetch'); // ensure node-fetch installed (npm i node-fetch@2)

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function postPayloadWithRetry(url, body, attempts = 5, delay = 400) {
  for (let i=0;i<attempts;i++){
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      console.warn('storePayload non-ok', await res.text());
    } catch (err) {
      console.warn('storePayload error', err.message || err);
    }
    await sleep(delay);
  }
  return false;
}

async function main() {
  const ethers = hre.ethers;
  const provider = ethers.provider;

  const envAddr = process.env.CONTRACT_ADDRESS;
  let registry;
  if (!envAddr || envAddr === '') {
    console.log("No CONTRACT_ADDRESS in .env — deploying a fresh CustodyRegistry");
    const Factory = await ethers.getContractFactory('CustodyRegistry');
    registry = await Factory.deploy();
    await registry.deployed();
    console.log("Deployed CustodyRegistry to:", registry.address);
    console.log("Note: update .env if you want the indexer to point here.");
  } else {
    console.log("Using CONTRACT_ADDRESS from .env:", envAddr);
    registry = await ethers.getContractAt('CustodyRegistry', envAddr);
  }

  const signers = await ethers.getSigners();
  const owner = signers[0];
  const device = signers[1];
  const nextParty = signers[2];

  console.log('Owner:', owner.address);
  console.log('Device:', device.address);
  console.log('NextParty:', nextParty.address);

  const idString = 'sku1|lot1|2025-09-01';
  const batchId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(idString));
  console.log('BatchId:', batchId);

  // register
  const txReg = await registry.connect(owner).registerBatch(batchId, 'QmExampleIPFSHash');
  const recReg = await txReg.wait();
  console.log('BatchRegistered tx mined, receipt logs:', recReg.logs.length);

  // helper anchor function that posts raw payload to indexer after anchor tx mined (with retry)
  async function anchorReading(nonce) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const payload = { tempC: 7.9, time: timeStr, nonce }; //i change from Date.now()  
    const payloadStr = JSON.stringify(payload);
    const readingHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadStr));
    const sig = await device.signMessage(ethers.utils.arrayify(readingHash));
    const tx = await registry.connect(owner).anchorSensor(batchId, readingHash, sig);
    const receipt = await tx.wait();
    console.log(`Anchored reading (nonce=${nonce}) txLogs=${receipt.logs.length} hash=${readingHash}`);

    // POST raw payload to indexer so UI can show it (retry if indexer not yet aware)
    const ok = await postPayloadWithRetry('http://localhost:4000/storePayload', {
      batchId, readingHash, rawPayload: payload
    }, 6, 500);
    if (!ok) console.warn('Failed to POST payload to indexer after retries');

    return { readingHash, sig, payload, receipt };
  }

  const r1 = await anchorReading('r-001');
  const r2 = await anchorReading('r-002');

  // transfer custody
  const txTransfer = await registry.connect(owner).transferCustody(batchId, nextParty.address);
  const recTransfer = await txTransfer.wait();
  console.log('CustodyTransferred tx mined, receipt logs:', recTransfer.logs.length);

  // Instead of queryFilter (which can be brittle), print receipts logs summary
  console.log('\nEvents summary (from the 3 tx receipts above):');
  console.log(' BatchRegistered tx logs:', recReg.logs.length);
  console.log(' SensorAnchored tx1 logs:', r1.receipt.logs.length);
  console.log(' SensorAnchored tx2 logs:', r2.receipt.logs.length);
  console.log(' CustodyTransferred tx logs:', recTransfer.logs.length);

  console.log('');
  console.log(`Call indexer: curl http://localhost:4000/verify/${batchId}`);
  console.log('Done demoFlow.');
}

main().catch((err) => {
  console.error('demoFlow error', err);
  process.exitCode = 1;
});
