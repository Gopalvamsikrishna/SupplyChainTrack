// scripts/print_handoffs.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(process.cwd(), 'supplychain.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open DB', dbPath, err && err.message);
    process.exit(1);
  }
});

db.all("SELECT id, batch_id, from_addr, to_addr, time FROM handoffs ORDER BY time ASC", (err, rows) => {
  if (err) {
    console.error('Query error:', err.message);
    db.close();
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log('No handoffs found in DB.');
  } else {
    console.table(rows.map(r => ({
      id: r.id,
      batch_id: r.batch_id,
      from: r.from_addr,
      to: r.to_addr,
      time_unix: r.time,
      time_human: new Date(Number(r.time) * 1000).toLocaleString()
    })));
  }
  db.close();
});
