'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface Props {
  imageSrc: string;
  contentType: string;
  onConfirm: (blob: Blob, contentType: string) => void;
  onCancel: () => void;
}

/** Crop image to the selected square area and return a JPEG Blob. */
export async function getCroppedImg(imageSrc: string, croppedAreaPixels: Area): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Impossible de charger l\'image'));
    image.src = imageSrc;
  });

  const size = Math.min(croppedAreaPixels.width, croppedAreaPixels.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    size,
    size,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Export canvas échoué'));
      },
      'image/jpeg',
      0.92,
    );
  });
}

/**
 * Full-screen crop modal — 1:1 square aspect, pan+zoom, no distortion.
 * Used by UploadControl when kind==='avatar'.
 */
export default function AvatarCropModal({ imageSrc, onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onConfirm(blob, 'image/jpeg');
    } catch {
      // ponytail: on canvas error, bail — user can retry with a different file
      setProcessing(false);
    }
  };

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(22,19,15,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Dialog panel — centered, max 480px wide, not full-screen */}
      <div
        role="dialog"
        aria-label="Recadrer la photo de profil"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--paper)',
          border: '3px solid var(--ink)',
          borderRadius: 10,
          boxShadow: '5px 5px 0 var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Crop area — fixed height so the panel stays compact */}
        <div style={{ position: 'relative', height: 300, background: '#111' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div
          style={{
            borderTop: '2px solid var(--ink)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <label
            style={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: '100%' }}
              aria-label="Zoom de la photo"
            />
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="ep-btn-secondary"
              style={{ fontSize: 13, padding: '7px 14px' }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!croppedAreaPixels || processing}
              className="ep-btn-primary"
              style={{ fontSize: 13, padding: '7px 16px' }}
            >
              {processing ? 'Préparation…' : 'Rogner'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
