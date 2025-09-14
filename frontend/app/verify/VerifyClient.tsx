"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export function shorten(addr: string, pre = 8, suf = 6) {
  if (!addr) return '';
  if (addr.length <= pre + suf + 3) return addr;
  return `${addr.slice(0, pre)}…${addr.slice(-suf)}`;
}

export default function VerifyClient() {
  const [batchId, setBatchId] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const scannedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchVerify(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`http://localhost:4000/verify/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function startScanner() {
    setError(null);
    setResult(null);
    setScanning(true);
    scannedRef.current = false;

    const codeReader = new BrowserMultiFormatReader();
    codeReaderRef.current = codeReader;

    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const chosenDeviceId = devices.length > 0 ? devices[devices.length - 1].deviceId : undefined;
      const previewElem = videoRef.current!;
      if (!previewElem) throw new Error("Video element not available");

      await codeReader.decodeFromVideoDevice(chosenDeviceId, previewElem, (res, err) => {
        if (res && !scannedRef.current) {
          scannedRef.current = true;
          const text = res.getText();
          let val = text;
          try {
            const u = new URL(text);
            if (u.searchParams.get("batch")) val = u.searchParams.get("batch") as string;
            else {
              const parts = u.pathname.split("/");
              val = parts[parts.length - 1] || val;
            }
          } catch (_) {}
          try { codeReader.reset(); } catch (_) {}
          stopScanner();

          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => {
            setBatchId(val);
            fetchVerify(val);
          }, 250);
        }
      });
    } catch (err: any) {
      setError("Camera / permission error: " + (err.message || err));
      setScanning(false);
      if (codeReaderRef.current) {
        try { codeReaderRef.current.reset(); } catch (_) {}
      }
    }
  }

  function stopScanner() {
    setScanning(false);
    if (codeReaderRef.current) {
      try { codeReaderRef.current.reset(); } catch(_) {}
      codeReaderRef.current = null;
    }
    try {
      const video = videoRef.current;
      if (video && video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    } catch (_) {}
    scannedRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  return (
    <div className="mt-4">
      <div style={{ display: "flex", gap: 8 }}>
        <input className="p-2 border rounded flex-1" placeholder="Paste batchId (0x...)" value={batchId} onChange={(e)=>setBatchId(e.target.value.trim())}/>
        <button className="px-3 py-2 bg-slate-700 text-white rounded" onClick={() => fetchVerify(batchId)}>Verify</button>
        <button className="px-3 py-2 bg-slate-700 text-white rounded" onClick={() => (scanning ? stopScanner() : startScanner())}>{scanning ? "Stop scan" : "Scan QR"}</button>
      </div>

      {scanning && (
        <div className="mt-3">
          <video ref={videoRef} style={{ width: 360, height: 240, borderRadius: 8, background: "#000" }} playsInline autoPlay muted />
          <div className="text-sm text-gray-500 mt-2">Scanning… allow camera access</div>
        </div>
      )}

      {loading && <p className="mt-3">Loading…</p>}
      {error && <p className="mt-3 text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-white rounded shadow-sm">
            <div className="text-sm text-gray-500">Batch</div>
            <div className="font-mono break-words">{result.batch?.batch_id ?? '—'}</div>
            <div className="text-sm text-gray-500">Created: {result.batch?.created_at ? new Date(result.batch.created_at * 1000).toLocaleString() : 'Unknown'}</div>
          </div>

          <div>
            <h4 className="text-lg font-medium">Custody Timeline</h4>
            {(!result.handoffs || result.handoffs.length === 0) ? (
              <div className="text-gray-500">No custody transfers recorded.</div>
            ) : (
              <ol className="mt-2 space-y-2">
                {result.handoffs.map((h:any) => (
                  <li key={h.id} className="p-2 bg-white rounded shadow-sm">
                    <div className="text-sm text-gray-500">{h.time ? new Date(h.time*1000).toLocaleString() : 'Unknown time'}</div>
                    <div className="mt-1"><strong>{h.from_addr}</strong> → <strong>{h.to_addr}</strong></div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h4 className="text-lg font-medium">Sensor Readings</h4>
            {(!result.sensors || result.sensors.length === 0) ? (
              <div className="text-gray-500">No sensor readings</div>
            ) : (
              <div className="mt-2 space-y-2">
                {result.sensors.map((s:any) => {
                  const whenMs = s.payload_ts ?? (s.time ? s.time * 1000 : null);
                  const whenHuman = whenMs ? new Date(whenMs).toLocaleString() : 'Unknown time';
                  return (
                    <div key={s.id} className="p-3 mb-2 border rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-black-600">Reading</div>
                          <div className="font-medium">{s.nonce ?? s.short_hash}</div>
                          <div className="text-xs text-black-500">{whenHuman}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Signer</div>
                          <div className="font-mono text-sm">{s.signer_name ?? shorten(s.signer)}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            {s.short_hash}
                            <button
                              title="Copy full hash"
                              className="ml-1 px-1 py-0.5 text-xs bg-gray-100 rounded"
                              onClick={() => navigator.clipboard.writeText(s.reading_hash)}
                            >📋</button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm">
                        {s.tempC !== null && s.tempC !== undefined ? <div>Temp: {s.tempC} °C</div> : <div>Temp: unknown</div>}
                        <details className="mt-1 text-xs"><summary>Raw payload</summary>
                          <pre className="text-xs whitespace-pre-wrap">{s.raw_payload}</pre>
                        </details>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
