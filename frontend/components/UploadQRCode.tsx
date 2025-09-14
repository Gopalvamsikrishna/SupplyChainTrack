// frontend/components/UploadQRCode.tsx
import React, { useRef } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

export default function UploadQRCode({ onResult }: { onResult: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    try {
      const codeReader = new BrowserQRCodeReader();
      const result = await codeReader.decodeFromImageUrl(blobUrl);
      onResult(result.getText());
    } catch (err) {
      console.error(err);
      alert('Could not decode QR from image');
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  return (
    <div className="mt-2">
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} />
      <div className="text-xs text-gray-500 mt-1">Upload an image if camera is blocked</div>
    </div>
  );
}
