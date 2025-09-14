// scripts/inspect_recent_txs.js
require('dotenv').config();
const { ethers } = require('hardhat');

async function main() {
  const addr = (process.env.CONTRACT_ADDRESS || '').toLowerCase();
  if (!addr) {
    console.error('Set CONTRACT_ADDRESS in .env');
    process.exit(1);
  }
  const provider = ethers.provider;
  const artifact = require(process.env.ARTIFACT_PATH || './artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json');
  const iface = new ethers.utils.Interface(artifact.abi);

  const latest = await provider.getBlockNumber();
  const lookback = 12; // inspect last 12 blocks (adjust if needed)
  console.log('Inspecting blocks', latest - lookback + 1, '→', latest);

  for (let b = Math.max(0, latest - lookback + 1); b <= latest; b++) {
    const block = await provider.getBlockWithTransactions(b);
    if (!block || !block.transactions) continue;
    for (const tx of block.transactions) {
      const to = (tx.to || '').toLowerCase();
      if (to === addr) {
        console.log('---');
        console.log('block', b, 'txHash', tx.hash, 'from', tx.from, 'to', tx.to);
        const rec = await provider.getTransactionReceipt(tx.hash);
        console.log(' receipt.logs.length:', rec.logs.length);
        if (rec.logs.length > 0) {
          for (const l of rec.logs) {
            try {
              const parsed = iface.parseLog(l);
              console.log('  parsed event:', parsed.name, parsed.args);
            } catch (e) {
              console.log('  unknown log topics0:', l.topics[0]);
            }
          }
        } else {
          console.log('  (no logs in this receipt)');
        }
      }
    }
  }
  console.log('done.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
