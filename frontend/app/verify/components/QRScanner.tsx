import { useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface QRScannerProps {
  scanning: boolean;
  onScanResult: (result: string) => void;
  onScanError: (error: string) => void;
  stopScanner: () => void;
}

export default function QRScanner({ scanning, onScanResult, onScanError, stopScanner }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const isCleaningUpRef = useRef<boolean>(false); // Track cleanup state to prevent duplicate cleanups
  
  // Expose the cleanup function to the parent component via the stopScanner prop
  useEffect(() => {
    // Override the stopScanner prop with our cleanup function
    if (typeof stopScanner === 'function') {
      const originalStopScanner = stopScanner;
      // @ts-ignore - This is a hack to expose our cleanup function
      stopScanner.cleanup = cleanupCameraResources;
    }
    
    return () => {
      // Clean up our hack when the component unmounts
      if (typeof stopScanner === 'function') {
        // @ts-ignore
        delete stopScanner.cleanup;
      }
    };
  }, [stopScanner]);

  // Function to properly clean up all camera resources
  const cleanupCameraResources = () => {
    // Prevent duplicate cleanups
    if (isCleaningUpRef.current) {
      console.log('Cleanup already in progress, skipping...');
      return;
    }
    
    isCleaningUpRef.current = true;
    console.log('Cleaning up camera resources...');
    
    // Force stop all media tracks from all devices
    try {
      // This is a more aggressive approach to ensure all camera resources are released
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        // Get all media devices
        navigator.mediaDevices.enumerateDevices()
          .then(devices => {
            console.log(`Found ${devices.length} media devices, ensuring all camera tracks are stopped`);
          })
          .catch(err => {
            console.error('Error enumerating devices:', err);
          });
      }
      
      // Direct approach to stop ALL active media tracks
      if (typeof navigator.mediaDevices !== 'undefined') {
        console.log('Stopping all active media tracks globally');
        navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          .then(stream => {
            // Stop all tracks in this stream
            stream.getTracks().forEach(track => {
              track.stop();
            });
          })
          .catch(err => {
            // This error is expected if permissions are denied
            console.log('No new media tracks to stop:', err.name);
          });
      }
    } catch (err) {
      console.error('Error accessing media devices:', err);
    }
    
    try {
      // 1. Stop the ZXing reader if it exists
      if (readerRef.current) {
        console.log('Resetting ZXing reader...');
        try {
          // First try to reset the reader
          readerRef.current.reset();
          
          // Then try to release any resources it might be holding
          // @ts-ignore - Accessing internal property to ensure cleanup
          if (readerRef.current.reader && typeof readerRef.current.reader.reset === 'function') {
            // @ts-ignore
            readerRef.current.reader.reset();
          }
          
          // @ts-ignore - Accessing internal property to ensure cleanup
          if (readerRef.current.timerId) {
            // @ts-ignore
            clearTimeout(readerRef.current.timerId);
            // @ts-ignore
            readerRef.current.timerId = null;
          }
          
          // @ts-ignore - Accessing internal property to ensure cleanup
          if (readerRef.current.stream) {
            // @ts-ignore
            readerRef.current.stream = null;
          }
        } catch (e) {
          console.error('Error during ZXing reader reset:', e);
        } finally {
          // Always set the reader to null to release the reference
          readerRef.current = null;
        }
      }
      
      // 2. Stop all media tracks from the video element
      if (videoRef.current && videoRef.current.srcObject) {
        const mediaStream = videoRef.current.srcObject as MediaStream;
        const tracks = mediaStream.getTracks();
        
        console.log(`Stopping ${tracks.length} media tracks...`);
        tracks.forEach(track => {
          console.log(`Stopping track: ${track.kind} (${track.id})`);
          // First disable the track before stopping it
          track.enabled = false;
          // Then stop the track
          track.stop();
          
          // Force garbage collection by removing references
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
        });
        
        // 3. Clear the srcObject
        videoRef.current.srcObject = null;
        
        // Force garbage collection
        try {
          // @ts-ignore - Force garbage collection of MediaStream
          mediaStream.oninactive = null;
          // @ts-ignore - Force garbage collection of MediaStream
          mediaStream.onactive = null;
          // @ts-ignore - Force garbage collection of MediaStream
          mediaStream.onaddtrack = null;
          // @ts-ignore - Force garbage collection of MediaStream
          mediaStream.onremovetrack = null;
        } catch (e) {
          console.error('Error cleaning up MediaStream event handlers:', e);
        }
      } else {
        console.log('No media stream to clean up');
      }
      
      // 4. Reset the video element completely
      if (videoRef.current) {
        console.log('Resetting video element...');
        // Remove all event listeners
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onplay = null;
        videoRef.current.onpause = null;
        videoRef.current.onended = null;
        videoRef.current.onerror = null;
        
        // Pause the video
        videoRef.current.pause();
        
        // Reset video properties
        try {
          videoRef.current.currentTime = 0;
          videoRef.current.muted = true;
          
          // Force a repaint of the video element
          videoRef.current.style.display = 'none';
          // Force browser to process the style change
          void videoRef.current.offsetHeight;
          // Restore the display
          videoRef.current.style.display = '';
        } catch (e) {
          console.error('Error resetting video element:', e);
        }
      }
      
      console.log('Camera resources cleanup completed');
    } catch (err) {
      console.error('Error during camera resources cleanup:', err);
    } finally {
      isCleaningUpRef.current = false; // Reset cleanup flag regardless of success/failure
    }
  };

  // Handle external stop scanner requests
  useEffect(() => {
    // When scanning is toggled off, this effect will run
    if (!scanning && readerRef.current) {
      console.log('External stop scanner request detected');
      cleanupCameraResources();
    }
  }, [scanning]);

  useEffect(() => {
    if (scanning) {
      startScanner();
    } else {
      // Ensure resources are cleaned up when scanning is toggled off
      cleanupCameraResources();
    }

    // Cleanup function that runs when component unmounts or dependencies change
    return () => {
      console.log('Component unmounting or dependencies changing, cleaning up resources');
      cleanupCameraResources();
    };
  }, [scanning, onScanResult, onScanError]);

  // Add global event listeners for page unload and visibility change to ensure cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('Page unloading, cleaning up camera resources');
      cleanupCameraResources();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && scanning) {
        console.log('Page hidden, cleaning up camera resources');
        cleanupCameraResources();
      }
    };
    
    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Clean up event listeners when component unmounts
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [scanning]);
  
  const startScanner = async () => {
    try {
      if (!videoRef.current) return;

      // First, ensure any existing scanner and camera resources are fully cleaned up
      cleanupCameraResources();
      
      console.log('Initializing new QR scanner...');
      readerRef.current = new BrowserMultiFormatReader();
      const constraints = {
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // Add additional constraints for better performance
          frameRate: { ideal: 15 },
          aspectRatio: { ideal: 1.777778 } // 16:9
        }
      };

      console.log('Starting QR scanner...');
      await readerRef.current.decodeFromConstraints(
        constraints,
        videoRef.current,
        (result, error) => {
          if (result) {
            console.log('QR code detected:', result);
            const text = result.getText();
            onScanResult(text);
          }
          if (error) {
            // Only report meaningful errors, not just absence of QR code
            if (error.name !== 'NotFoundException') {
              console.error('Scanner error:', error);
              onScanError(`Scanner error: ${error.message}`);
            }
          }
        }
      );
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          onScanError('Camera access denied. Please grant permission to use your camera.');
        } else if (err.name === 'NotFoundError') {
          onScanError('No camera found. Please connect a camera to your device.');
        } else {
          onScanError(`Scanner error: ${err.message}`);
        }
      } else {
        onScanError('An unknown error occurred while starting the scanner');
      }
    }
  };

  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="w-full aspect-video object-cover"
          playsInline
          autoPlay
          muted
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-48 h-48 border-2 border-white/50 rounded-lg flex items-center justify-center">
            <div className="w-40 h-40 border border-white/30 rounded-lg flex items-center justify-center">
              <div className="animate-pulse text-white text-xs bg-black/50 px-2 py-1 rounded">
                Position QR code here
              </div>
            </div>
          </div>
        </div>
        <div className="absolute top-0 left-0 right-0 bg-black/70 text-white text-center py-1 text-sm">
          QR Scanner Active
        </div>
      </div>
      <div className="text-gray-600 text-sm mt-2 bg-gray-100 p-2 rounded-md">
        Point camera at a QR code containing a batch ID
      </div>
    </div>
  );
}