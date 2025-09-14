// scripts/checkContractAndEvents.js
require('dotenv').config();
const fs = require('fs');
const { ethers } = require('hardhat');

async function main(){
  const env = process.env;
  const RPC = env.RPC_URL || 'http://127.0.0.1:8545';
  const addr = (env.CONTRACT_ADDRESS || '').trim();
  if (!addr) {
    console.error('Set CONTRACT_ADDRESS in .env first');
    process.exit(1);
  }
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const code = await provider.getCode(addr);
  if (!code || code === '0x') {
    console.error('No contract code at', addr);
    process.exit(2);
  } else console.log('Contract code present at', addr, 'size', code.length);

  const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json','utf8'));
  const contract = new ethers.Contract(addr, artifact.abi, provider);

  const from = 0; // startBlock
  const to = 'latest';
  const br = await contract.queryFilter(contract.filters.BatchRegistered(), from, to);
  const ct = await contract.queryFilter(contract.filters.CustodyTransferred(), from, to);
  const sa = await contract.queryFilter(contract.filters.SensorAnchored(), from, to);
  console.log('BatchRegistered:', br.length, 'CustodyTransferred:', ct.length, 'SensorAnchored:', sa.length);

  console.log('Sample events (first of each):');
  if (br.length) console.log(' BatchRegistered[0] args=', br[0].args);
  if (ct.length) console.log(' CustodyTransferred[0] args=', ct[0].args);
  if (sa.length) console.log(' SensorAnchored[0] args=', sa[0].args);
}
main().catch(e=>{console.error(e); process.exit(1);});
