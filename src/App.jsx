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
    if (window.qz) {
      window.qz.api.showDebug(true);
    }

    // Load certificate and setup security
    const initializeQZ = async () => {
      try {
        const cert = await $.ajax({ url: '/certificate.pem', cache: false });
        
        window.qz.security.setCertificatePromise((resolve) => resolve(cert));
        
        // Set up signature promise for silent printing
        window.qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
          try {
            // For testing, you can use this simple SHA-1 hash
            // In production, use proper signing from your backend
            const hash = window.qz.security.sha256(toSign);
            resolve(hash);
          } catch (err) {
            reject(err);
          }
        });

        await connectQZ();
      } catch (err) {
        setStatus(`Initialization failed: ${err.message}`);
        console.error('Initialization error:', err);
      }
    };

    if (window.qz) {
      initializeQZ();
    } else {
      setStatus('QZ Tray script not loaded. Make sure qz-tray.js is in your public folder.');
    }

    return () => {
      if (window.qz && window.qz.websocket.isActive()) {
        window.qz.websocket.disconnect().catch(err => console.error('Disconnect error:', err));
      }
    };
  }, []);

  const connectQZ = async () => {
    if (!window.qz.websocket.isActive()) {
      try {
        await window.qz.websocket.connect({
          host: 'localhost',
          port: 8181,
          bypassSSLError: true,
          retries: 3,
          delay: 1
        });
        setConnected(true);
        setStatus('Connected to QZ Tray');
        await loadPrinters();
      } catch (err) {
        setStatus(`Connection failed: ${err.message}`);
        throw err;
      }
    }
  };

  const loadPrinters = async () => {
    try {
      const printerList = await window.qz.printers.find();
      setPrinters(printerList);
      if (printerList.length > 0) {
        setSelectedPrinter(printerList[0]);
        setStatus(`Found ${printerList.length} printer(s)`);
      } else {
        setStatus('No printers found');
      }
    } catch (err) {
      setStatus(`Printer discovery failed: ${err.message}`);
      throw err;
    }
  };

  const printTestReceipt = async () => {
    if (!selectedPrinter) {
      setStatus('Please select a printer');
      return;
    }

    try {
      // Create printer config with silent printing options
      const config = window.qz.configs.create(selectedPrinter, {
        scaleContent: false,
        silent: true,  // This attempts to suppress any dialogs
        jobName: 'POS Receipt',
        copies: 1,
        altPrinting: true  // Helps with some POS printers
      });

      // ESC/POS commands for better compatibility with POS printers
      const esc = '\x1B';
      const gs = '\x1D';
      const cmds = [
        esc + '@',  // Initialize printer
        esc + 'a' + '\x01',  // Center align
        'POS PRINTER TEST\n\n',
        esc + 'a' + '\x00',  // Left align
        'Item 1          $10.00\n',
        'Item 2          $15.50\n',
        '------------------------\n',
        'TOTAL           $25.50\n\n',
        esc + 'a' + '\x01',  // Center align
        'Thank you!\n',
        new Date().toLocaleString() + '\n\n',
        gs + 'V' + '\x41' + '\x00',  // Full cut
        esc + 'd' + '\x03'  // Feed 3 lines
      ];

      await window.qz.print(config, cmds);
      setStatus('Print job sent successfully!');
    } catch (err) {
      setStatus(`Print failed: ${err.message}`);
      console.error('Print error:', err);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>QZ Tray POS Printing</h1>
        <div className="status">
          <p><strong>{status}</strong></p>
          <p>Connection: {connected ? '✅ Connected' : '❌ Disconnected'}</p>
        </div>

        {connected && (
          <>
            <div>
              <label>Select Printer: </label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
              >
                {printers.length === 0 && <option value="">No printers found</option>}
                {printers.map((printer) => (
                  <option key={printer} value={printer}>
                    {printer}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button onClick={printTestReceipt} disabled={!selectedPrinter}>
                Print Test Receipt
              </button>
              <button onClick={loadPrinters} style={{ marginLeft: '1rem' }}>
                Refresh Printers
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
              style={{ color: 'lightblue' }}
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