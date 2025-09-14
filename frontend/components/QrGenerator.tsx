import React, { useState } from 'react';
import QRCode from 'qrcode.react';

export default function QrGenerator({ batchId }: { batchId: string }) {
  const [show, setShow] = useState(false);
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${batchId}`;

  if (!batchId) return null;
  return (
    <div className="mt-3">
      <button className="px-3 py-1 bg-slate-700 text-white rounded" onClick={() => setShow(v => !v)}>
        {show ? 'Hide QR' : 'Show QR'}
      </button>
      {show && (
        <div className="mt-3 p-3 bg-white rounded shadow-sm inline-block">
          <QRCode value={url} size={220} />
          <div className="text-xs mt-2">Scan this QR or download & share</div>
          <a className="block text-sm mt-2" href={url} target="_blank" rel="noreferrer">Open link</a>
        </div>
      )}
    </div>
  );
}
