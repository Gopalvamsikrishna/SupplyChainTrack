// frontend/components/SensorCard.tsx
"use client";
import React, { useState } from "react";
import { shortenHex, formatTs, parsePayload, tempSeverityClass } from "../utils";

export default function SensorCard({ sensor, addressBook = {} }: {
  sensor: any,
  addressBook?: Record<string,string>
}) {
  const [open, setOpen] = useState(false);
  const [showFullHash, setShowFullHash] = useState(false);

  const payload = parsePayload(sensor.raw_payload);
  const temp = payload?.tempC ?? null;
  const payloadTs = payload?.ts ?? sensor.time;
  const signer = sensor.signer || null;
  const signerLabel = (signer && addressBook[signer.toLowerCase()]) ? addressBook[signer.toLowerCase()] : signer;

  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
      // small toast could be added; for now simple feedback:
      // eslint-disable-next-line no-alert
      // alert('Copied!');
    } catch {
      // ignore
    }
  }

  function downloadPayload() {
    const blob = new Blob([JSON.stringify(payload ?? sensor, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sensor.reading_hash || 'sensor'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 bg-white/95 dark:bg-slate-800 rounded-md border shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500">{formatTs(sensor.time)} — signer:{" "}
            <button
              onClick={() => signer && copy(signer)}
              className="font-mono text-sm text-sky-600 hover:underline"
              title={signer ?? 'Unknown'}
            >
              {signer ? (addressBook[signer?.toLowerCase()] || shortenHex(signer, 10, 6)) : 'Unknown'}
            </button>
          </div>

          <div className="mt-2 font-mono text-sm text-slate-900 dark:text-slate-100 break-words">
            <span className="text-xs text-gray-500 mr-2">Hash</span>
            <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{ showFullHash ? sensor.reading_hash : shortenHex(sensor.reading_hash, 12, 6) }</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {sensor.signature ? (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold">Device signed</div>
          ) : (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">No signature</div>
          )}

          <div className="flex gap-2">
            <button className="px-2 py-1 border rounded text-sm" onClick={() => setShowFullHash(s => !s)}>{showFullHash ? 'Hide' : 'Show full'}</button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => sensor.reading_hash && copy(sensor.reading_hash)}>Copy hash</button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => downloadPayload()}>Download JSON</button>
          </div>
        </div>
      </div>

      {/* parsed payload summary */}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-gray-500">Payload</div>
          {payload ? (
            <div className="mt-1 p-2 bg-gray-50 dark:bg-slate-700 rounded text-sm font-mono text-slate-900 dark:text-slate-100">
              {payload.nonce && <div><strong>nonce:</strong> {payload.nonce}</div>}
              {payload.ts && <div><strong>observed:</strong> {formatTs(payload.ts)}</div>}
              {payload.tempC !== undefined && (
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-2 px-2 py-1 rounded ${tempSeverityClass(payload.tempC)}`}>
                    <span className="text-xs font-semibold">{payload.tempC}°C</span>
                    <span className="text-[10px] text-gray-500">temperature</span>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-1 text-sm text-gray-500">Raw payload not stored</div>
          )}
        </div>

        <div className="md:col-span-2">
          <div className="text-xs text-gray-500">Raw JSON</div>
          <pre className="mt-1 bg-gray-900 text-white p-2 rounded text-sm overflow-auto" style={{maxHeight: 160}}>
            {JSON.stringify(payload ?? sensor.raw_payload ?? sensor, null, 2)}
          </pre>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-400">Reading hash: <span className="font-mono">{shortenHex(sensor.reading_hash,10,6)}</span></div>
    </div>
  );
}
