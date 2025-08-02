import React, { useState, useRef, useEffect } from 'react';
import type { ISignalingService } from '../services/signalingInterface';
import { QrSignalingService } from '../services/qrSignalingService';

interface QrSignalingProps {
  signaling: ISignalingService | null;
  onConnect: (peerId: string) => void;
  onDisconnect: (peerId: string) => void;
}

/**
 * QR Signaling component that handles displaying QR codes and copy/paste functionality
 * for WebRTC signaling without a server.
 */
export const QrSignaling: React.FC<QrSignalingProps> = ({
  signaling,
  onConnect,
  onDisconnect,
}) => {
  const [offerQrCode, setOfferQrCode] = useState<string | null>(null);
  const [answerQrCode, setAnswerQrCode] = useState<string | null>(null);
  const [offerJsonData, setOfferJsonData] = useState<string | null>(null);
  const [answerJsonData, setAnswerJsonData] = useState<string | null>(null);
  const [peerIdInput, setPeerIdInput] = useState('');
  const [qrDataInput, setQrDataInput] = useState('');
  const [connectionStep, setConnectionStep] = useState<'idle' | 'offering' | 'answering'>('idle');
  const [copySuccess, setCopySuccess] = useState('');
  const qrDataTextAreaRef = useRef<HTMLTextAreaElement>(null);

  // Register for QR code generation events
  useEffect(() => {
    // Early return if signaling is null
    if (!signaling) return;
    
    // Check if signaling is QrSignalingService to access specific methods
    if (signaling instanceof QrSignalingService) {
      // Enhance the signaling service to provide raw JSON data along with QR code
      
      // Monkey-patch the original method to capture JSON data
      const originalGenerateQrCode = signaling.generateQrCode.bind(signaling);
      signaling.generateQrCode = async (data: any) => {
        // Store the data based on type (offer or answer)
        if (data.payload && data.payload.type === 'offer') {
          setOfferJsonData(JSON.stringify(data));
        } else if (data.payload && data.payload.type === 'answer') {
          setAnswerJsonData(JSON.stringify(data));
        }
        
        const qrImageData = await originalGenerateQrCode(data);
        
        if (data.payload && data.payload.type === 'offer') {
          setOfferQrCode(qrImageData);
          setConnectionStep('offering');
        } else if (data.payload && data.payload.type === 'answer') {
          setAnswerQrCode(qrImageData);
          setConnectionStep('answering');
        }
        
        return qrImageData;
      };
      
      // Note: We'll trigger offer creation via the generate offer button
      
      const offerUnsubscribe = signaling.onOfferGenerated((qrData) => {
        setOfferQrCode(qrData);
        setConnectionStep('offering');
      });

      const answerUnsubscribe = signaling.onAnswerGenerated((qrData) => {
        setAnswerQrCode(qrData);
      });

      return () => {
        offerUnsubscribe();
        answerUnsubscribe();
        // Restore original method if component unmounts
        if (signaling instanceof QrSignalingService) {
          signaling.generateQrCode = originalGenerateQrCode;
        }
      };
    }
    
    // If not QrSignalingService, we can't register for QR events
    return undefined;
  }, [signaling]);

  // Function to copy QR code data to clipboard
  const copyQrToClipboard = (qrData: string) => {
    // Extract the actual data from the QR code data URL if needed
    // For now, we just copy the entire data URL
    navigator.clipboard.writeText(qrData)
      .then(() => {
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        setCopySuccess('Failed to copy');
      });
  };

  // Function to handle initiating a connection (generating offer)
  const handleInitiateConnection = () => {
    if (peerIdInput.trim()) {
      setConnectionStep('offering');
      onConnect(peerIdInput);
    }
  };

  // Function to process pasted QR data
  const handleProcessQrData = () => {
    try {
      // Check if signaling is QrSignalingService to access specific methods
      if (signaling instanceof QrSignalingService) {
        signaling.processQrData(qrDataInput);
        setQrDataInput(''); // Clear the input field
        setConnectionStep('answering');
      } else {
        console.error('Signaling service does not support QR code processing');
        alert('QR code processing is not supported by the current signaling service.');
      }
    } catch (err) {
      console.error('Error processing QR data:', err);
    }
  };
  
  // Function to handle disconnecting from a peer
  const handleDisconnect = () => {
    if (peerIdInput) {
      onDisconnect(peerIdInput);
      setPeerIdInput('');
      setConnectionStep('idle');
    }
  };

  // Handle paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setQrDataInput(text);
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      alert('Failed to access clipboard. Please paste the data manually.');
    }
  };

  return (
    <div className="qr-signaling-container">
      <h2>Connection Process</h2>
      
      {/* Connection Process Steps */}
      <div className="connection-steps">
        <div className={`step ${connectionStep === 'idle' || connectionStep === 'offering' ? 'active' : ''}`}>
          <div className="step-number">Step 1</div>
          <div className="step-label">Generate & Share Connection Offer</div>
        </div>
        <div className={`step-arrow ${connectionStep === 'answering' ? 'active' : ''}`}>→</div>
        <div className={`step ${connectionStep === 'answering' ? 'active' : ''}`}>
          <div className="step-number">Step 2</div>
          <div className="step-label">Process Response & Complete Connection</div>
        </div>
      </div>
      
      {connectionStep === 'idle' && (
        <div className="connection-initiator step-container">
          <h3>Step 1: Start a Connection</h3>
          <p className="step-instruction">Enter the ID of the person you want to connect with, then generate a connection offer to share with them.</p>
          <div className="input-group">
            <label htmlFor="peer-id">Peer ID:</label>
            <input
              id="peer-id"
              type="text"
              value={peerIdInput}
              onChange={(e) => setPeerIdInput(e.target.value)}
              placeholder="Enter peer ID"
            />
          </div>
          <div className="button-group" style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="primary-button"
              onClick={handleInitiateConnection}
              disabled={!peerIdInput.trim()}
            >
              Generate Connection Offer
            </button>
            <button
              className="secondary-button"
              onClick={handleDisconnect}
              disabled={!peerIdInput.trim()}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {connectionStep === 'offering' && offerQrCode && (
        <div className="offer-container step-container">
          <h3>Step 1: Share Your Connection Offer</h3>
          <div className="step-instruction-box">
            <p className="step-instruction"><strong>Important:</strong> Share this connection data with the person you want to connect with. They must paste this into their "Process Connection Data" area.</p>
          </div>
          
          <div className="qr-data-container">
            <div className="qr-column">
              <h4>Option 1: QR Code</h4>
              <div className="qr-display">
                <img src={offerQrCode} alt="Connection Offer QR Code" />
              </div>
              <button 
                className="copy-button"
                onClick={() => copyQrToClipboard(offerQrCode)}
              >
                {copySuccess === 'QR Image Copied!' ? '✓ Copied!' : 'Copy QR Image Data'}
              </button>
            </div>
            
            <div className="text-column">
              <h4>Option 2: JSON Text Data</h4>
              {offerJsonData && (
                <>
                  <div className="json-data-display">
                    <textarea 
                      readOnly 
                      value={offerJsonData} 
                      rows={5}
                      className="json-textarea"
                      onClick={(e) => {
                        (e.target as HTMLTextAreaElement).select();
                        document.execCommand('copy');
                        setCopySuccess('JSON Copied!');
                        setTimeout(() => setCopySuccess(''), 2000);
                      }}
                    />
                  </div>
                  <button 
                    className="copy-button"
                    onClick={() => {
                      copyQrToClipboard(offerJsonData);
                      setCopySuccess('JSON Copied!');
                    }}
                  >
                    {copySuccess === 'JSON Copied!' ? '✓ Copied!' : 'Copy JSON Data'}
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="step-instruction-box status-box">
            <p><strong>Status:</strong> Waiting for the other person to process your connection offer and send back their response...</p>
          </div>
        </div>
      )}

      <div className="receive-container step-container">
        <h3>{connectionStep === 'answering' ? 'Step 2: Process Connection Data' : 'Process Connection Data'}</h3>
        <div className="step-instruction-box">
          <p className="step-instruction">
            <strong>Instructions:</strong> Paste the connection data you received from the other person here.
            After processing, you may need to share the response back to complete the connection.
          </p>
        </div>
        
        <div className="qr-input">
          <textarea
            ref={qrDataTextAreaRef}
            value={qrDataInput}
            onChange={(e) => setQrDataInput(e.target.value)}
            placeholder="Paste connection data here (QR image data or JSON text)"
            rows={5}
            className="process-textarea"
          />
        </div>
        <div className="actions">
          <button 
            className="secondary-button"
            onClick={handlePaste}
          >
            Paste from Clipboard
          </button>
          <button 
            className="primary-button"
            onClick={handleProcessQrData}
            disabled={!qrDataInput.trim()}
          >
            Process Connection Data
          </button>
        </div>
      </div>

      {connectionStep === 'answering' && answerQrCode && (
        <div className="answer-container step-container">
          <h3>Step 2: Share Your Connection Response</h3>
          <div className="step-instruction-box">
            <p className="step-instruction">
              <strong>Important:</strong> Share this response with the person who sent you the connection offer.
              They must paste this into their "Process Connection Data" area to complete the connection.
            </p>
          </div>
          
          <div className="qr-data-container">
            <div className="qr-column">
              <h4>Option 1: QR Code</h4>
              <div className="qr-display">
                <img src={answerQrCode} alt="Connection Answer QR Code" />
              </div>
              <button 
                className="copy-button"
                onClick={() => {
                  copyQrToClipboard(answerQrCode);
                  setCopySuccess('QR Image Copied!');
                }}
              >
                {copySuccess === 'QR Image Copied!' ? '✓ Copied!' : 'Copy QR Image Data'}
              </button>
            </div>
            
            <div className="text-column">
              <h4>Option 2: JSON Text Data</h4>
              {answerJsonData && (
                <>
                  <div className="json-data-display">
                    <textarea 
                      readOnly 
                      value={answerJsonData} 
                      rows={5}
                      className="json-textarea"
                      onClick={(e) => {
                        (e.target as HTMLTextAreaElement).select();
                        document.execCommand('copy');
                        setCopySuccess('JSON Copied!');
                        setTimeout(() => setCopySuccess(''), 2000);
                      }}
                    />
                  </div>
                  <button 
                    className="copy-button"
                    onClick={() => {
                      copyQrToClipboard(answerJsonData);
                      setCopySuccess('JSON Copied!');
                    }}
                  >
                    {copySuccess === 'JSON Copied!' ? '✓ Copied!' : 'Copy JSON Data'}
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="step-instruction-box success-box">
            <p><strong>Status:</strong> Connection process initiated! Wait for the other person to process this response to complete the connection.</p>
          </div>
        </div>
      )}

      <style>{`
        .qr-signaling-container {
          margin: 20px 0;
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background-color: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          max-width: 800px;
        }
        
        h2 {
          margin-bottom: 20px;
          color: #333;
          font-size: 24px;
          text-align: center;
        }
        
        h3 {
          margin-bottom: 15px;
          color: #0275d8;
          font-size: 20px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        
        h4 {
          margin: 0 0 10px 0;
          color: #495057;
        }
        
        /* Step indicators */
        .connection-steps {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 30px;
          gap: 15px;
        }
        
        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 10px 15px;
          border-radius: 8px;
          background-color: #f8f9fa;
          border: 1px solid #dee2e6;
          width: 45%;
          opacity: 0.7;
          transition: all 0.3s ease;
        }
        
        .step.active {
          background-color: #e8f4fd;
          border-color: #0275d8;
          opacity: 1;
          box-shadow: 0 3px 6px rgba(2, 117, 216, 0.1);
        }
        
        .step-number {
          font-size: 18px;
          font-weight: bold;
          color: #0275d8;
          margin-bottom: 5px;
        }
        
        .step-arrow {
          font-size: 24px;
          color: #6c757d;
          transition: color 0.3s ease;
        }
        
        .step-arrow.active {
          color: #0275d8;
        }
        
        .step-label {
          font-size: 14px;
          text-align: center;
          color: #495057;
        }
        
        .step-container {
          background-color: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .step-instruction-box {
          background-color: #e8f4fd;
          border-left: 4px solid #0275d8;
          padding: 10px 15px;
          margin-bottom: 20px;
          border-radius: 0 4px 4px 0;
        }
        
        .step-instruction-box.status-box {
          background-color: #fff3cd;
          border-left-color: #ffc107;
        }
        
        .step-instruction-box.success-box {
          background-color: #d4edda;
          border-left-color: #28a745;
        }
        
        .step-instruction {
          margin: 0;
          color: #495057;
          line-height: 1.5;
          font-size: 14px;
        }
        
        .input-group {
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
        }
        
        .input-group label {
          margin-bottom: 5px;
          font-weight: 500;
          color: #495057;
        }
        
        input, textarea {
          padding: 10px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 14px;
          transition: border-color 0.2s ease;
        }
        
        input:focus, textarea:focus {
          border-color: #0275d8;
          outline: none;
          box-shadow: 0 0 0 3px rgba(2, 117, 216, 0.25);
        }
        
        .qr-data-container {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }
        
        .qr-column, .text-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .qr-display {
          margin: 15px 0;
          display: flex;
          justify-content: center;
          background-color: white;
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .qr-display img {
          max-width: 180px;
        }
        
        .json-textarea {
          width: 100%;
          font-family: monospace;
          font-size: 12px;
          background-color: #f8f9fa;
          border: 1px solid #ced4da;
          resize: vertical;
        }
        
        .process-textarea {
          width: 100%;
          font-family: monospace;
          font-size: 14px;
          resize: vertical;
        }
        
        .actions {
          margin-top: 15px;
          display: flex;
          gap: 10px;
        }
        
        .primary-button {
          padding: 10px 15px;
          background-color: #0275d8;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s ease;
        }
        
        .primary-button:hover {
          background-color: #025aa5;
        }
        
        .secondary-button {
          padding: 10px 15px;
          background-color: #6c757d;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s ease;
        }
        
        .secondary-button:hover {
          background-color: #5a6268;
        }
        
        .copy-button {
          padding: 8px 12px;
          background-color: #6c757d;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          width: 100%;
          max-width: 180px;
          margin-top: 10px;
          transition: background-color 0.2s ease;
        }
        
        .copy-button:hover {
          background-color: #5a6268;
        }
        
        button:disabled {
          background-color: #dee2e6;
          cursor: not-allowed;
          opacity: 0.7;
        }
        
        .instructions {
          font-size: 14px;
          color: #6c757d;
          margin-top: 10px;
          font-style: italic;
        }
        
        .json-data-display {
          width: 100%;
          margin-top: 0;
          margin-bottom: 10px;
        }
        
        .json-data-display small {
          display: block;
          font-size: 12px;
          color: #6c757d;
          margin-top: 5px;
          text-align: center;
        }
        
        .offer-container, .answer-container, .receive-container {
          margin-top: 25px;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
      `}</style>
    </div>
  );
};
