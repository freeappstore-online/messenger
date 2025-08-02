import type { SignalPayload, StoredSignal } from './signalingService';
import type { ISignalingService } from './signalingInterface';
import QRCode from 'qrcode';

/**
 * QR code based signaling for WebRTC
 * Uses QR codes and copy/paste mechanism to exchange WebRTC offers and answers
 * without requiring a server.
 * 
 * This implementation stores messages in memory and exposes methods to generate and
 * process QR codes for WebRTC signaling.
 */
export class QrSignalingService implements ISignalingService {
  readonly me: string;
  private listeners: Array<(id: string, sig: StoredSignal) => void> = [];
  private pendingSignals: Map<string, StoredSignal> = new Map(); // Queue of pending signals
  
  // Event emitters for UI
  private onOfferGeneratedCallbacks: Array<(qrData: string) => void> = [];
  private onAnswerGeneratedCallbacks: Array<(qrData: string) => void> = [];
  
  constructor(me: string) {
    this.me = me;
  }

  /**
   * Remove whitespace and common clipboard symbol from any copied ID
   */
  private static sanitizeId(id: string): string {
    return id.replace(/\s|\u{1F4CB}/gu, "");
  }

  /**
   * Generate a QR code for the provided signal data
   */
  async generateQrCode(data: any): Promise<string> {
    try {
      const jsonData = JSON.stringify(data);
      return await QRCode.toDataURL(jsonData, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Process data from scanned/pasted QR code
   * @param qrData The data from the QR code (JSON string)
   */
  processQrData(qrData: string): void {
    try {
      const data = JSON.parse(qrData);
      
      // Validate the QR data has the expected format
      if (!data || !data.payload || !data.to || !data.from) {
        throw new Error('Invalid QR code data format');
      }
      
      // Generate a unique ID for this signal
      const id = crypto.randomUUID?.() ?? Date.now().toString();
      
      // Call all registered listeners with the signal data
      this.listeners.forEach(callback => {
        callback(id, data.payload as StoredSignal);
      });
      
      // Store the signal for later retrieval
      this.pendingSignals.set(id, data.payload as StoredSignal);
      
      console.log(`[QrSignal] Processed ${data.payload.type} from ${data.from} to ${data.to}`);
    } catch (error) {
      console.error('Error processing QR data:', error);
      throw error;
    }
  }

  /**
   * Send a signal to a peer by generating a QR code
   * In QR signaling, "sending" means generating a QR code for the UI to display
   */
  async send(toUserId: string, payload: SignalPayload): Promise<void> {
    const cleanId = QrSignalingService.sanitizeId(toUserId);
    const signalData = {
      to: cleanId,
      from: QrSignalingService.sanitizeId(this.me),
      payload: {
        ...payload,
        from: this.me,
        createdAt: Date.now()
      }
    };
    
    console.log(`[QrSignal] Generating ${payload.type} for ${cleanId}`);
    
    // Generate QR code for the payload
    const qrCodeUrl = await this.generateQrCode(signalData);
    
    // Notify UI components that a new QR code is available
    if (payload.type === 'offer') {
      this.onOfferGeneratedCallbacks.forEach(cb => cb(qrCodeUrl));
    } else if (payload.type === 'answer') {
      this.onAnswerGeneratedCallbacks.forEach(cb => cb(qrCodeUrl));
    }
  }

  /**
   * Listen for incoming signals
   * Returns an unsubscribe function
   */
  listen(cb: (id: string, sig: StoredSignal) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  /**
   * Acknowledge receipt of a signal
   * For QR signaling, this removes the signal from the pending queue
   */
  async ack(id: string): Promise<void> {
    this.pendingSignals.delete(id);
  }

  /**
   * Register a callback to be notified when an offer QR code is generated
   */
  onOfferGenerated(callback: (qrData: string) => void): () => void {
    this.onOfferGeneratedCallbacks.push(callback);
    return () => {
      this.onOfferGeneratedCallbacks = this.onOfferGeneratedCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Register a callback to be notified when an answer QR code is generated
   */
  onAnswerGenerated(callback: (qrData: string) => void): () => void {
    this.onAnswerGeneratedCallbacks.push(callback);
    return () => {
      this.onAnswerGeneratedCallbacks = this.onAnswerGeneratedCallbacks.filter(cb => cb !== callback);
    };
  }
}
