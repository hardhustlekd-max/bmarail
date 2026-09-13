/**
 * High-Reliability Image Upload Manager (Redesigned)
 *
 * Provides:
 * 1. Concurrent task queueing (max 2 active network uploads) to prevent mobile connection drops.
 * 2. Per-instance AbortControllers to cancel stale in-flight uploads when files are replaced/removed.
 * 3. Two-phase pipeline: Instant local display preview -> Async reliable background cloud upload.
 * 4. Automatic memory cleanup (revoking object URLs).
 * 5. Automatic retry with exponential backoff on network dropouts.
 * 6. Bulletproof offline fallback (lightweight compressed WebP/JPEG micro data URLs < 80KB).
 */

import { compressImageToBlob, CompressedImageResult } from '../utils/imageCompressor';

export type UploadStatus = 'idle' | 'compressing' | 'uploading' | 'completed' | 'error';

export interface UploadProgressEvent {
  status: UploadStatus;
  progress: number; // 0 - 100
  previewUrl: string;
  remoteUrl?: string;
  error?: string;
}

export type UploadListener = (event: UploadProgressEvent) => void;

interface QueuedUploadTask {
  id: string;
  source: string | File | Blob;
  folder: string;
  abortController: AbortController;
  onProgress?: UploadListener;
  resolve: (url: string) => void;
  reject: (err: any) => void;
}

class ImageUploadManager {
  private activeUploads = new Map<string, AbortController>();
  private inMemoryUrlCache = new Map<string, string>();
  private activeObjectUrls = new Set<string>();
  private queue: QueuedUploadTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrent = 2;

  /**
   * Cleans up an object URL safely
   */
  public revokeUrl(url?: string): void {
    if (url && url.startsWith('blob:') && this.activeObjectUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
        this.activeObjectUrls.delete(url);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Aborts an in-flight upload task by ID
   */
  public abortUpload(id: string): void {
    const controller = this.activeUploads.get(id);
    if (controller) {
      try {
        controller.abort();
      } catch {
        // ignore
      }
      this.activeUploads.delete(id);
    }
  }

  /**
   * Main entry point to process and upload an image
   */
  public async upload(
    id: string,
    source: string | File | Blob,
    folder: string = 'permits',
    onProgress?: UploadListener
  ): Promise<{ previewUrl: string; remoteUrlPromise: Promise<string> }> {
    // 1. Abort any previous upload for this slot
    this.abortUpload(id);

    // 2. If it's already a remote cloud URL or storage route, return immediately
    if (typeof source === 'string') {
      if (
        source.startsWith('http://') ||
        source.startsWith('https://') ||
        source.startsWith('/uploads/') ||
        source.startsWith('/api/storage/')
      ) {
        onProgress?.({
          status: 'completed',
          progress: 100,
          previewUrl: source,
          remoteUrl: source,
        });
        return {
          previewUrl: source,
          remoteUrlPromise: Promise.resolve(source),
        };
      }

      if (this.inMemoryUrlCache.has(source)) {
        const cachedUrl = this.inMemoryUrlCache.get(source)!;
        onProgress?.({
          status: 'completed',
          progress: 100,
          previewUrl: cachedUrl,
          remoteUrl: cachedUrl,
        });
        return {
          previewUrl: cachedUrl,
          remoteUrlPromise: Promise.resolve(cachedUrl),
        };
      }
    }

    onProgress?.({
      status: 'compressing',
      progress: 15,
      previewUrl: typeof source === 'string' && source.startsWith('data:') ? source : '',
    });

    // 3. High-efficiency client-side compression pass
    let compressed: CompressedImageResult;
    try {
      compressed = await compressImageToBlob(source, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.82,
        maxBytes: 150 * 1024,
        contrastBoost: true,
      });
    } catch (compErr) {
      console.warn('[ImageUploadManager] Compression error, using direct source fallback:', compErr);
      const fallbackUrl = typeof source === 'string' ? source : '';
      onProgress?.({
        status: 'error',
        progress: 0,
        previewUrl: fallbackUrl,
        error: 'Compression failed',
      });
      return {
        previewUrl: fallbackUrl,
        remoteUrlPromise: Promise.resolve(fallbackUrl),
      };
    }

    // Register object URL for tracking
    this.activeObjectUrls.add(compressed.objectUrl);
    const instantPreviewUrl = compressed.objectUrl;

    onProgress?.({
      status: 'uploading',
      progress: 30,
      previewUrl: instantPreviewUrl,
    });

    // 4. Enqueue background upload task
    const abortController = new AbortController();
    this.activeUploads.set(id, abortController);

    const remoteUrlPromise = new Promise<string>((resolve, reject) => {
      this.queue.push({
        id,
        source: compressed.blob,
        folder,
        abortController,
        onProgress,
        resolve: (url) => {
          this.activeUploads.delete(id);
          if (typeof source === 'string') {
            this.inMemoryUrlCache.set(source, url);
          }
          this.inMemoryUrlCache.set(compressed.dataUrl, url);
          resolve(url);
        },
        reject: (err) => {
          this.activeUploads.delete(id);
          // If upload fails, gracefully fallback to clean micro dataUrl (< 80KB)
          resolve(compressed.dataUrl);
        },
      });

      this.processQueue();
    });

    return {
      previewUrl: instantPreviewUrl,
      remoteUrlPromise,
    };
  }

  /**
   * Processes the upload queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    // Check if task was aborted while waiting in queue
    if (task.abortController.signal.aborted) {
      this.processQueue();
      return;
    }

    this.activeCount++;

    try {
      const remoteUrl = await this.executeNetworkUpload(task);
      task.onProgress?.({
        status: 'completed',
        progress: 100,
        previewUrl: remoteUrl,
        remoteUrl,
      });
      task.resolve(remoteUrl);
    } catch (err: any) {
      if (task.abortController.signal.aborted) {
        // Aborted silently
        return;
      }
      console.warn(`[ImageUploadManager] Upload task ${task.id} notice:`, err?.message || err);
      task.onProgress?.({
        status: 'error',
        progress: 0,
        previewUrl: '',
        error: err?.message || 'Network upload failed',
      });
      task.reject(err);
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  /**
   * Executes HTTP POST upload with retry logic
   */
  private async executeNetworkUpload(task: QueuedUploadTask): Promise<string> {
    const isBlob = task.source instanceof Blob;
    const mimeType = isBlob ? (task.source as Blob).type || 'image/webp' : 'image/webp';
    const isWebp = mimeType.includes('webp');
    const ext = isWebp ? 'webp' : 'jpg';

    const formData = new FormData();
    formData.append('folder', task.folder);

    if (isBlob) {
      formData.append('file', task.source as Blob, `doc_${Date.now()}.${ext}`);
    } else {
      formData.append('dataUrl', String(task.source).replace(/\s+/g, ''));
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      if (task.abortController.signal.aborted) {
        throw new Error('Upload aborted by user');
      }

      task.onProgress?.({
        status: 'uploading',
        progress: 40 + attempts * 25,
        previewUrl: '',
      });

      try {
        const response = await fetch('/api/storage/upload', {
          method: 'POST',
          headers,
          body: formData,
          signal: task.abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        if (data && data.success && data.url) {
          return data.url;
        }
        throw new Error(data?.error || 'Invalid server response');
      } catch (err: any) {
        if (task.abortController.signal.aborted) {
          throw new Error('Upload aborted');
        }
        if (attempts >= maxAttempts) {
          throw err;
        }
        // Short exponential backoff before retry
        await new Promise((r) => setTimeout(r, 600 * attempts));
      }
    }

    throw new Error('Upload failed after retries');
  }
}

export const imageUploadManager = new ImageUploadManager();
