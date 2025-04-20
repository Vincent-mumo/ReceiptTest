import React, { useEffect, useState } from 'react';
import $ from 'jquery';
import './App.css';

function App() {
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [status, setStatus] = useState('Initializing QZ Tray...');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Enable debug logging
    window.qz.api.showDebug(true);

    // Load certificate
    $.ajax({ url: '/certificate.pem', cache: false }).then(
      (cert) => {
        window.qz.security.setCertificatePromise((resolve) => {
          resolve(cert);
        });
        connectQZ();
      },
      () => {
        setStatus('Failed to load certificate');
        console.error('Error loading certificate');
      }
    );

    // Client-side signing using Web Crypto API (testing only)
    window.qz.security.setSignaturePromise((toSign) => {
      return (resolve, reject) => {
        try {
          // Convert string to ArrayBuffer
          const encoder = new TextEncoder();
          const data = encoder.encode(toSign);
          // Compute SHA-1 hash
          crypto.subtle.digest('SHA-1', data).then((hashBuffer) => {
            // Convert hash to hex string
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
            resolve(hashHex);
          }).catch((err) => {
            reject(err);
          });
        } catch (err) {
          reject(err);
        }
      };
    });

    // Cleanup
    return () => {
      if (window.qz.websocket.isActive()) {
        window.qz.websocket.disconnect().catch((err) => console.error('Disconnect error:', err));
      }
    };
  }, []);

  const connectQZ = async () => {
    if (!window.qz) {
      setStatus('QZ Tray script not loaded');
      return;
    }

    if (!window.qz.websocket.isActive()) {
      try {
        await window.qz.websocket.connect();
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
      const printerList = await window.qz.printers.find();
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
      const config = window.qz.configs.create(selectedPrinter, {
        scaleContent: true,
        units: 'in',
        density: 203,
      });

      const esc = '\x1B';
      const gs = '\x1D';
      const cmds = [
        esc + '@',
        esc + 'a' + '\x01',
        'POS PRINTER TEST\n\n',
        esc + 'a' + '\x00',
        'Item 1          $10.00\n',
        'Item 2          $15.50\n',
        '------------------------\n',
        'TOTAL           $25.50\n\n',
        esc + 'a' + '\x01',
        'Thank you!\n',
        new Date().toLocaleString() + '\n\n',
        gs + 'V' + '\x41' + '\x10',
        esc + 'p' + '\x00' + '\x19' + '\xFA',
      ];

      await window.qz.print(config, cmds);
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