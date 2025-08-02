import { QrSignalingService } from './qrSignalingService';
import type { ISignalingService } from './signalingInterface';

/**
 * Creates a QR code-based signaling service
 * 
 * @param userId The ID of the current user
 * @returns A QR code signaling service that implements the ISignalingService interface
 */
export function createQrSignalingService(userId: string): ISignalingService {
  return new QrSignalingService(userId);
}
