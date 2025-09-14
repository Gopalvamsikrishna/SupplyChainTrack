// indexer.js (overwrite)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { ethers } = require('ethers');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || '').trim();
const ARTIFACT_PATH = process.env.ARTIFACT_PATH || './artifacts/contracts/CustodyRegistry.sol/CustodyRegistry.json';
const DB_PATH = process.env.DB_PATH || './supplychain.sqlite';
const START_BLOCK = parseInt(process.env.START_BLOCK || '0', 10);

if (!CONTRACT_ADDRESS) {
  console.error('Please set CONTRACT_ADDRESS in .env');
  process.exit(1);
}
if (!fs.existsSync(ARTIFACT_PATH)) {
  console.error('Artifact not found at', ARTIFACT_PATH);
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
const abi = artifact.abi;

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

const app = express();
app.use(cors());
app.use(bodyParser.json());


const db = new sqlite3.Database(DB_PATH);

// helper: get friendly name for address
function getActorName(address, cb) {
  db.get('SELECT name FROM actors WHERE LOWER(address)=LOWER(?)', [address], (err, row) => {
    if (err) return cb(null);
    if (!row) return cb(null);
    cb(row.name);
  });
}

// helper: short hex
function shortHex(hex, pre = 10, suf = 6) {
  if (!hex) return '';
  if (hex.length <= pre + suf + 3) return hex;
  return `${hex.slice(0, pre)}…${hex.slice(-suf)}`;
}

// parse raw payload safely
function parsePayload(raw) {
  try {
    if (!raw) return null;
    if (typeof raw === 'string') return JSON.parse(raw);
    return raw;
  } catch (e) {
    return null;
  }
}

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id TEXT PRIMARY KEY,
        ipfs_cid TEXT,
        manufacturer TEXT,
        created_at INTEGER
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS handoffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        from_addr TEXT,
        to_addr TEXT,
        time INTEGER,
        UNIQUE(batch_id, from_addr, to_addr, time)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS sensors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        reading_hash TEXT UNIQUE,
        signer TEXT,
        time INTEGER,
        raw_payload TEXT
      )
    `);
  });
}

// Helpers
function insertBatch(batchId, ipfsCid, manufacturer, time) {
  db.run(
    `INSERT OR IGNORE INTO batches(batch_id, ipfs_cid, manufacturer, created_at) VALUES (?, ?, ?, ?)`,
    [batchId, ipfsCid, manufacturer, time]
  );
}

function insertHandoff(batchId, fromAddr, toAddr, time) {
  db.run(
    `INSERT OR IGNORE INTO handoffs(batch_id, from_addr, to_addr, time) VALUES (?, ?, ?, ?)`,
    [batchId, fromAddr, toAddr, time]
  );
}

// Upsert sensor when event arrives (fills signer + authoritative time)
function upsertSensorFromEvent(batchId, readingHash, signer, time) {
  db.run(
    `UPDATE sensors SET signer = ?, time = ? WHERE reading_hash = ?`,
    [signer, time, readingHash],
    function (err) {
      if (err) {
        console.warn('sensor update error', err);
        return;
      }
      if (this.changes === 0) {
        // No existing row — insert new authoritative row
        db.run(
          `INSERT INTO sensors(batch_id, reading_hash, signer, time, raw_payload) VALUES (?, ?, ?, ?, NULL)`,
          [batchId, readingHash, signer, time]
        );
      } else {
        // updated existing placeholder — good
      }
    }
  );
}

// Store payload (the demo posts payloads after anchoring). This will either
// update an existing sensor row or create a placeholder with current time.
function storePayload(batchId, readingHash, rawPayload) {
  const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  // First try updating raw_payload if row exists
  db.run(
    `UPDATE sensors SET raw_payload = ? WHERE reading_hash = ?`,
    [payloadStr, readingHash],
    function (err) {
      if (err) {
        console.warn('storePayload update error', err);
        return;
      }
      if (this.changes === 0) {
        // Insert placeholder row; time set to now (will be overwritten by event later)
        const now = Math.floor(Date.now() / 1000);
        db.run(
          `INSERT OR IGNORE INTO sensors(batch_id, reading_hash, signer, time, raw_payload) VALUES (?, ?, NULL, ?, ?)`,
          [batchId, readingHash, now, payloadStr]
        );
      }
    }
  );
}

// Index past events once at startup
async function indexPastEvents() {
  console.log('Indexing past events from block', START_BLOCK);
  try {
    // BatchRegistered events
    const brFilter = contract.filters.BatchRegistered();
    const brEvents = await contract.queryFilter(brFilter, START_BLOCK, 'latest');
    for (const e of brEvents) {
      try {
        const batchId = e.args.batchId.toString();
        const ipfsCid = e.args.ipfsCid;
        const manufacturer = e.args.manufacturer;
        const time = e.args.time.toNumber();
        insertBatch(batchId, ipfsCid, manufacturer, time);
      } catch (err) {
        console.warn('BatchRegistered parse error', err);
      }
    }

    // CustodyTransferred events
    const ctFilter = contract.filters.CustodyTransferred();
    const ctEvents = await contract.queryFilter(ctFilter, START_BLOCK, 'latest');
    for (const e of ctEvents) {
      try {
        const batchId = e.args.batchId.toString();
        const fromAddr = e.args.from;
        const toAddr = e.args.to;
        const time = e.args.time.toNumber();
        insertHandoff(batchId, fromAddr, toAddr, time);
      } catch (err) {
        console.warn('CustodyTransferred parse error', err);
      }
    }

    // SensorAnchored events
    const sFilter = contract.filters.SensorAnchored();
    const sEvents = await contract.queryFilter(sFilter, START_BLOCK, 'latest');
    for (const e of sEvents) {
      try {
        const batchId = e.args.batchId.toString();
        const readingHash = e.args.readingHash.toString();
        const signer = e.args.signer;
        const time = e.args.time.toNumber();
        upsertSensorFromEvent(batchId, readingHash, signer, time);
      } catch (err) {
        console.warn('SensorAnchored parse error', err);
      }
    }

    console.log('Past events indexed.');
  } catch (err) {
    console.error('Error indexing past events', err);
  }
}

// Live subscriptions
function subscribeToEvents() {
  console.log('Subscribing to live events...');
  contract.on('BatchRegistered', (batchId, ipfsCid, manufacturer, time, event) => {
    try {
      const b = batchId.toString();
      console.log('BatchRegistered', b);
      insertBatch(b, ipfsCid, manufacturer, time.toNumber());
    } catch (e) {
      console.warn('BatchRegistered handler error', e);
    }
  });

  contract.on('CustodyTransferred', (batchId, fromAddr, toAddr, time, event) => {
    try {
      const b = batchId.toString();
      console.log('CustodyTransferred', b, fromAddr, '->', toAddr);
      insertHandoff(b, fromAddr, toAddr, time.toNumber());
    } catch (e) {
      console.warn('CustodyTransferred handler error', e);
    }
  });

  contract.on('SensorAnchored', (batchId, readingHash, signer, time, event) => {
    try {
      const b = batchId.toString();
      const rh = readingHash.toString();
      const t = Number(time.toString());
      // Insert or ignore sensor skeleton
      db.run(
        `INSERT OR IGNORE INTO sensors (batch_id, reading_hash, signer, time, raw_payload) VALUES (?, ?, ?, ?, ?)`,
        [b, rh, signer, t, null],
        (err) => {
          if (err) console.error('DB insert error (sensor skeleton):', err);
          else console.log('SensorAnchored event stored (skeleton):', rh);
        }
      );
    } catch (e) {
      console.warn('SensorAnchored handler error', e);
    }
  });
}

// Simple risk scoring (kept small)
function computeRisk(batchRow, handoffs, sensors) {
  let score = 0;
  const reasons = [];

  if (!batchRow) {
    score += 60;
    reasons.push('Origin missing');
  }

  if (!handoffs || handoffs.length === 0) {
    score += 20;
    reasons.push('No custody transfers recorded');
  }

  if (!sensors || sensors.length === 0) {
    score += 10;
    reasons.push('No sensor readings');
  } else {
    const now = Math.floor(Date.now() / 1000);
    const last = sensors[sensors.length - 1].time || 0;
    if (now - last > 24 * 3600) {
      score += 10;
      reasons.push('Sensor data stale');
    }
  }

  let label = 'Authentic';
  if (score > 40) label = 'Suspicious';
  else if (score > 10) label = 'Review';

  return { score, reasons, label };
}

// API endpoints
app.get('/verify/:batchId', (req, res) => {
  const batchId = req.params.batchId;
  // simple helper to promise-get actor name
  function actorNamePromise(address) {
    return new Promise((resolve) => {
      db.get('SELECT name FROM actors WHERE LOWER(address)=LOWER(?)', [address], (err, row) => {
        if (err) return resolve(null);
        if (!row) return resolve(null);
        resolve(row.name);
      });
    });
  }

  // fetch batch, handoffs, sensors
  db.get('SELECT * FROM batches WHERE batch_id = ?', [batchId], async (err, batchRow) => {
    if (err) return res.status(500).send({ error: err.message });
    const batch = batchRow ? {
      batch_id: batchRow.batch_id,
      ipfs_cid: batchRow.ipfs_cid,
      manufacturer: batchRow.manufacturer,
      created_at: batchRow.created_at
    } : null;

    const handoffsRows = await new Promise((resolve) => {
      db.all('SELECT * FROM handoffs WHERE batch_id = ? ORDER BY time ASC', [batchId], (e, rows) => {
        if (e) return resolve([]);
        resolve(rows || []);
      });
    });

    const sensorsRows = await new Promise((resolve) => {
      db.all('SELECT * FROM sensors WHERE batch_id = ? ORDER BY time ASC', [batchId], (e, rows) => {
        if (e) return resolve([]);
        resolve(rows || []);
      });
    });

    // Enrich handoffs with names
    const handoffs = [];
    for (const h of handoffsRows) {
      const fromName = (await actorNamePromise(h.from_addr)) || null;
      const toName = (await actorNamePromise(h.to_addr)) || null;
      handoffs.push({
        id: h.id,
        batch_id: h.batch_id,
        from_addr: h.from_addr,
        from_name: fromName,
        to_addr: h.to_addr,
        to_name: toName,
        time: h.time
      });
    }

    // Enrich sensors with parsed payload and signer name + short hash
    const sensors = [];
    for (const s of sensorsRows) {
      const signerName = (await actorNamePromise(s.signer)) || null;
      let parsed = null;
      try { parsed = s.raw_payload ? JSON.parse(s.raw_payload) : null; } catch(e){ parsed = null; }
      sensors.push({
        id: s.id,
        batch_id: s.batch_id,
        reading_hash: s.reading_hash,
        short_hash: shortHex(s.reading_hash, 12, 6),
        signer: s.signer,
        signer_name: signerName,
        time: s.time,
        tempC: s.tempC,            // parsed column (may be null)
        payload_ts: s.payload_ts,  // stored in ms (if any)
        nonce: s.nonce,
        raw_payload: s.raw_payload
      });
    }

    // compute a simple risk (existing)
    const risk = computeRisk(batch, handoffs, sensors); // keep your existing logic

    res.json({ batch, handoffs, sensors, risk });
  });
});

// POST endpoint for demo to store raw payloads
app.post('/storePayload', async (req, res) => {
  const { batchId, readingHash, rawPayload } = req.body;
  if (!readingHash || !batchId) return res.status(400).send({ ok: false, reason: 'missing' });

  const rawStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  const parsed = parsePayload(rawPayload);

  // compute tempC, payload_ts, nonce from rawPayload (if present)
  const tempC = parsed?.tempC ?? null;
  // Convert ts in payload to clock format hh:mm:ss:ms
  let payload_ts = null;
  if (parsed?.ts) {
    const n = Number(parsed.ts);
    // If ts looks like seconds (<1e12), convert to ms
    const ms = (n < 1e12) ? n * 1000 : n;
    const date = new Date(ms);
    const pad = (num, size = 2) => String(num).padStart(size, '0');
    payload_ts = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}:${pad(date.getMilliseconds(), 3)}`;
  }
  const nonce = parsed?.nonce ?? null;

  // Update existing sensor row
  db.run(
    `UPDATE sensors SET raw_payload = ?, tempC = COALESCE(?, tempC), payload_ts = COALESCE(?, payload_ts), nonce = COALESCE(?, nonce) WHERE reading_hash = ?`,
    [rawStr, tempC, payload_ts, nonce, readingHash],
    function (err) {
      if (err) {
        console.error('storePayload update error', err);
        return res.status(500).send({ ok: false });
      }
      // if no row updated (no previous SensorAnchored event), insert now
      if (this.changes === 0) {
        db.run(
          `INSERT OR IGNORE INTO sensors (batch_id, reading_hash, raw_payload, tempC, payload_ts, nonce) VALUES (?, ?, ?, ?, ?, ?)`,
          [batchId, readingHash, rawStr, tempC, payload_ts, nonce],
          (err2) => {
            if (err2) console.error('storePayload insert error', err2);
            return res.send({ ok: true });
          }
        );
      } else {
        return res.send({ ok: true });
      }
    }
  );
});

const PORT = process.env.PORT || 4000;

async function start() {
  initDb();
  await indexPastEvents();
  subscribeToEvents();
  app.listen(PORT, () => {
    console.log(`Indexer API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Indexer start error', err);
});
