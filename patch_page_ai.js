const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Add AI states around line 777 (before Debit Note state)
const aiStates = \`
  // AI Voice Assistant States
  const [isListening, setIsListening] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiPayload, setAiPayload] = useState<{ action: string, targets: any[], originalText: string } | null>(null);
  const [aiExecutionProgress, setAiExecutionProgress] = useState<{ current: number, total: number, active: boolean }>({ current: 0, total: 0, active: false });

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showAlert("Speech Recognition is not supported in this browser. Please use Chrome.", "warning");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN'; // Works for Hinglish
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAiPrompt(transcript);
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      showAlert("Speech recognition error: " + e.error, "error");
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const processAiCommand = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiParsing(true);
    try {
      // Pass only Requirement Open records as context
      const openIndents = data.filter(r => r["Status"] === "Requirement Open");
      
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, contextData: openIndents })
      });
      const resData = await res.json();
      
      if (!resData.success) {
        throw new Error(resData.message || resData.error || "Unknown Error");
      }

      const { action, targetRkdNumbers } = resData.result;
      
      if (!action || action === "UNKNOWN" || !targetRkdNumbers || targetRkdNumbers.length === 0) {
        showAlert("AI could not understand the command or found no matching indents.", "warning");
        return;
      }

      const targets = openIndents.filter(r => targetRkdNumbers.includes(r["Store RKD Number"]));
      
      if (targets.length === 0) {
        showAlert("No matching open indents found for the command.", "warning");
        return;
      }

      setAiPayload({ action, targets, originalText: aiPrompt });
      setAiReviewOpen(true);
      setAiPrompt("");

    } catch (e: any) {
      showAlert("AI Processing Error: " + e.message, "error");
    } finally {
      setIsAiParsing(false);
    }
  };

  const executeAiBulkAction = async () => {
    if (!aiPayload || aiPayload.targets.length === 0) return;
    setAiReviewOpen(false);
    setAiExecutionProgress({ current: 0, total: aiPayload.targets.length, active: true });
    
    let successCount = 0;
    for (let i = 0; i < aiPayload.targets.length; i++) {
      const row = aiPayload.targets[i];
      setAiExecutionProgress(p => ({ ...p, current: i + 1 }));
      
      try {
        if (aiPayload.action === "CLOSE") {
          // Equivalent to Manual Issue with full quantity
          await fetch("/api/sheets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ISSUE",
              rkdNumber: row["Store RKD Number"],
              issueQty: row["Require Qty"], // Full quantity
              status: "Requirement Closed",
              itemName: row["Item Name"],
              rate: "0" // Defaults fallback
            })
          });
        } else if (aiPayload.action === "CANCEL") {
          // Equivalent to cancelling
          await fetch("/api/sheets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ISSUE",
              rkdNumber: row["Store RKD Number"],
              issueQty: "0",
              status: "Requirement Cancelled",
              itemName: row["Item Name"],
              rate: "0"
            })
          });
        }
        successCount++;
      } catch (e) {
        console.error("Failed AI action for RKD:", row["Store RKD Number"]);
      }
    }
    
    setAiExecutionProgress({ current: 0, total: 0, active: false });
    setAiPayload(null);
    showAlert(\`Successfully processed \${successCount} / \${aiPayload.targets.length} entries.\`, "success");
    fetchData(true);
  };

  // Debit Note / Reverse Entry Modal State\`;

code = code.replace('  // Debit Note / Reverse Entry Modal State', aiStates);


// 2. Add AI Bar in UI near search term
const searchBarRegex = /<div className=\{styles.searchWrapper\}>\s*<Search className=\{styles.searchIcon\} size=\{16\} \/>\s*<input[^>]*value=\{searchTerm\}[^>]*\/>\s*<\/div>/g;

const uiReplacement = \`
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: '350px' }}>
                <div className={styles.searchWrapper} style={{ flex: 1, borderColor: isListening ? '#8b5cf6' : '#e2e8f0', boxShadow: isListening ? '0 0 0 2px rgba(139, 92, 246, 0.2)' : 'none', transition: 'all 0.2s' }}>
                  {isListening ? (
                     <div style={{ paddingLeft: 12, paddingRight: 4, display: 'flex', alignItems: 'center' }}>
                       <div className={styles.liveDot} style={{ background: '#ef4444', marginRight: 8 }}></div>
                     </div>
                  ) : (
                     <button onClick={startListening} style={{ background: 'transparent', border: 'none', cursor: 'pointer', paddingLeft: 12, paddingRight: 4, display: 'flex', alignItems: 'center' }} title="Voice Command">
                       <span style={{ fontSize: '1.1rem' }}>🎙️</span>
                     </button>
                  )}
                  <input
                    type="text"
                    placeholder="Ask AI to close or cancel indents... (e.g. 'close last 5')"
                    className={styles.searchInput}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') processAiCommand(); }}
                    style={{ paddingLeft: 8 }}
                  />
                  {isAiParsing ? (
                    <Loader2 className={styles.btnSpin} size={16} style={{ margin: '0 12px', color: '#8b5cf6' }} />
                  ) : (
                    <button onClick={processAiCommand} style={{ background: 'transparent', border: 'none', cursor: 'pointer', paddingRight: 12, display: 'flex', alignItems: 'center' }} title="Send to AI">
                       <span style={{ fontSize: '1.2rem' }}>✨</span>
                    </button>
                  )}
                </div>

                <div className={styles.searchWrapper}>
                  <Search className={styles.searchIcon} size={16} />
                  <input
                    type="text"
                    placeholder="Search Table..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
\`;
code = code.replace(searchBarRegex, uiReplacement);


// 3. Add AI Review Modal at the end
const aiReviewModal = \`
      {/* ── AI Review Modal ── */}
      {aiReviewOpen && aiPayload && (
        <div className={styles.modalOverlay} onClick={() => setAiReviewOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIconBox} style={{ background: '#fdf4ff', color: '#d946ef' }}>
                ✨
              </div>
              <div>
                <h3 className={styles.modalTitle}>Review AI Action</h3>
                <p className={styles.modalSubtitle}>
                  Command: <strong style={{ color: '#1e293b' }}>"\${aiPayload.originalText}"</strong>
                  <br />
                  Action to perform: <strong style={{ color: aiPayload.action === "CLOSE" ? '#22c55e' : '#ef4444' }}>\${aiPayload.action}</strong>
                </p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setAiReviewOpen(false)}>×</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '12px' }}>
              The AI selected the following \${aiPayload.targets.length} entries. Remove any you don't want to process.
            </p>

            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>RKD Number</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Item Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Person</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Req Qty</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {aiPayload.targets.map(row => (
                    <tr key={row["Store RKD Number"]} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px' }}>{row["Store RKD Number"]}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row["Item Name"]}</td>
                      <td style={{ padding: '8px 12px' }}>{row["Person Filling Name"]}</td>
                      <td style={{ padding: '8px 12px', color: '#8b5cf6', fontWeight: 700 }}>{row["Require Qty"]}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button 
                          onClick={() => setAiPayload({ ...aiPayload, targets: aiPayload.targets.filter(r => r["Store RKD Number"] !== row["Store RKD Number"]) })}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.2rem' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                  {aiPayload.targets.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>All items removed. You can cancel.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className={styles.btnCancel} onClick={() => setAiReviewOpen(false)}>Cancel</button>
              <button 
                className={styles.dribbbleBtnPrimary} 
                disabled={aiPayload.targets.length === 0} 
                onClick={executeAiBulkAction}
              >
                Execute \${aiPayload.action} (\${aiPayload.targets.length} entries)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Background Execution Overlay ── */}
      {aiExecutionProgress.active && (
         <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.8)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
            <Loader2 className={styles.btnSpin} size={48} style={{ color: '#8b5cf6', marginBottom: 16 }} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>AI Executing Action</h2>
            <p style={{ fontSize: '1rem', color: '#64748b', marginTop: 8 }}>
              Processing entry \${aiExecutionProgress.current} of \${aiExecutionProgress.total}...
            </p>
            <div style={{ width: '300px', height: '8px', background: '#e2e8f0', borderRadius: '4px', marginTop: '24px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#8b5cf6', width: \`\${(aiExecutionProgress.current / aiExecutionProgress.total) * 100}%\`, transition: 'width 0.3s' }}></div>
            </div>
         </div>
      )}

      {/* Modern Alert Modal — replaces all browser alert() */}
\`;

code = code.replace('{/* Modern Alert Modal — replaces all browser alert() */}', aiReviewModal);

fs.writeFileSync('src/app/page.tsx', code);
