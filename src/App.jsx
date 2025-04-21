import React, { useEffect, useState } from 'react';
import $ from 'jquery';
import qz from 'qz-tray';
import { KJUR } from 'jsrsasign'; // For RSA-SHA1 signing
import './App.css';

// Custom hex to base64 converter (replaces jsrsasign's hextob64)
const hexToBase64 = (hex) => {
  try {
    hex = hex.replace(/\s|0x/g, '');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return btoa(String.fromCharCode(...bytes));
  } catch (err) {
    throw new Error('Failed to convert hex to base64: ' + err.message);
  }
};

function App() {
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [status, setStatus] = useState('Initializing QZ Tray...');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Enable QZ Tray debug logging
    qz.api.showDebug(true);

    // Log KJUR to verify signing capability
    console.log('KJUR:', KJUR);

    // Load certificate (override.crt)
    $.ajax({ url: '/override.crt', cache: false, dataType: 'text' }).then(
      (cert) => {
        if (!cert.includes('-----BEGIN CERTIFICATE-----')) {
          setStatus('Invalid certificate format in override.crt');
          console.error('Certificate content is invalid:', cert.substring(0, 50) + '...');
          return;
        }
        qz.security.setCertificatePromise((resolve) => {
          resolve(cert);
        });
        console.log('Certificate loaded successfully:', cert.substring(0, 50) + '...');
        connectQZ();
      },
      (err) => {
        setStatus('Failed to load override.crt. Ensure it is in public/');
        console.error('Error loading certificate:', err);
      }
    );

    // Client-side signing with jsrsasign (development only)
    qz.security.setSignaturePromise((toSign) => {
      return (resolve, reject) => {
        // Fetch private key
        $.ajax({ url: '/private-key.pem', cache: false, dataType: 'text' }).then(
          (privateKey) => {
            console.log('Private key loaded:', privateKey.substring(0, 50) + '...');
            if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
              console.error('Invalid private key format:', privateKey.substring(0, 50) + '...');
              reject('Invalid private key format');
              return;
            }
            try {
              // Initialize RSA signature
              const sig = new KJUR.crypto.Signature({ alg: 'SHA1withRSA' });
              sig.init(privateKey);
              sig.updateString(toSign);
              const signature = sig.sign();
              console.log('Raw signature (hex):', signature);
              // Convert to base64
              const base64Signature = hexToBase64(signature);
              console.log('Generated signature for:', toSign, 'Base64 Signature:', base64Signature);
              resolve(base64Signature);
            } catch (err) {
              console.error('Signing error:', err);
              reject('Error signing message: ' + err.message);
            }
          },
          (err) => {
            console.error('Error fetching private key:', err);
            reject('Error fetching private key: ' + err.message);
          }
        );
      };
    });

    // Cleanup WebSocket on component unmount
    return () => {
      if (qz.websocket.isActive()) {
        qz.websocket.disconnect().catch((err) => console.error('Disconnect error:', err));
      }
    };
  }, []);

  const connectQZ = async () => {
    if (!qz) {
      setStatus('QZ Tray script not loaded');
      console.error('QZ Tray script not loaded');
      return;
    }

    if (!qz.websocket.isActive()) {
      try {
        // Use ws:// for localhost
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const useSecure = !isLocalhost;
        console.log('Connecting with:', isLocalhost ? 'ws://' : 'wss://');
        await qz.websocket.connect({ host: 'localhost', usingSecure: useSecure, retries: 3, delay: 1 });
        setStatus('Connected to QZ Tray');
        setConnected(true);
        loadPrinters();
      } catch (err) {
        setStatus(`Failed to connect to QZ Tray: ${err.message || err}`);
        console.error('Connection error:', err);
      }
    }
  };

  const loadPrinters = async () => {
    try {
      const printerList = await qz.printers.find();
      console.log('Printers found:', printerList);
      setPrinters(printerList);
      setSelectedPrinter(printerList[0] || '');
      setStatus(printerList.length > 0 ? `Found ${printerList.length} printer(s)` : 'No printers found');
    } catch (err) {
      setStatus(`Could not list printers: ${err.message || err}`);
      console.error('Printer discovery error:', err);
    }
  };

  const printTestReceipt = async () => {
    if (!selectedPrinter) {
      setStatus('Please select a printer');
      return;
    }

    try {
      const config = qz.configs.create(selectedPrinter, {
        scaleContent: true,
        units: 'in',
        density: 203,
      });

      const esc = '\x1B';
      const gs = '\x1D';
      const cmds = [
        esc + '@', // Initialize printer
        esc + 'a' + '\x01', // Center align
        'POS PRINTER TEST\n\n',
        esc + 'a' + '\x00', // Left align
        'Item 1          $10.00\n',
        'Item 2          $15.50\n',
        '------------------------\n',
        'TOTAL           $25.50\n\n',
        esc + 'a' + '\x01', // Center align
        'Thank you!\n',
        new Date().toLocaleString() + '\n\n',
        gs + 'V' + '\x41' + '\x10', // Cut paper
        esc + 'p' + '\x00' + '\x19' + '\xFA', // Open cash drawer
      ];

      await qz.print(config, cmds);
      setStatus('Print job sent!');
    } catch (err) {
      setStatus(`Print failed: ${err.message || err}`);
      console.error('Print error:', err);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>QZ Tray POS Printing</h1>
        <p>Status: <strong>{status}</strong></p>

        {connected && printers.length > 0 && (
          <>
            <div>
              <label>Select Printer: </label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
              >
                <option value="">Select a printer</option>
                {printers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button onClick={printTestReceipt} disabled={!selectedPrinter}>
                Print Test Receipt
              </button>
              <button onClick={loadPrinters} style={{ marginLeft: '1rem' }}>
                Reload Printers
              </button>
            </div>
          </>
        )}

        {!connected && (
          <div style={{ marginTop: '1rem', color: 'orange' }}>
            <p>Make sure QZ Tray is installed and running:</p>
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download QZ Tray
            </a>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;