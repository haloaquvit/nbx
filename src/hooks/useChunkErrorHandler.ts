import { useEffect } from 'react';

export const useChunkErrorHandler = () => {
  useEffect(() => {
    const handleChunkError = (event: ErrorEvent) => {
      // Handle chunk loading errors
      if (event.message.includes('Loading chunk') || 
          event.message.includes('ChunkLoadError') ||
          event.message.includes('Loading CSS chunk')) {
        console.error('Chunk loading error detected:', event);
        
        // Show user-friendly error message
        const errorMessage = document.createElement('div');
        errorMessage.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          color: white;
          font-family: Arial, sans-serif;
        `;
        
        errorMessage.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <h3>Terjadi Kesalahan Saat Memuat Halaman</h3>
            <p>Silakan refresh halaman untuk mencoba lagi.</p>
            <button onclick="window.location.reload()" style="
              padding: 10px 20px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              margin-top: 10px;
            ">Refresh Halaman</button>
          </div>
        `;
        
        document.body.appendChild(errorMessage);
        
        // Auto-reload after 5 seconds if user doesn't click
        setTimeout(() => {
          if (document.body.contains(errorMessage)) {
            window.location.reload();
          }
        }, 5000);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Handle unhandled promise rejections (often related to chunk loading)
      if (event.reason && typeof event.reason === 'string' && 
          (event.reason.includes('Loading chunk') || 
           event.reason.includes('ChunkLoadError'))) {
        console.error('Unhandled chunk loading rejection:', event.reason);
        handleChunkError({ message: event.reason } as ErrorEvent);
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}; 