const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Add state variables around line 712 (Debit Note state)
const stateToAdd = \`
  // Master Modal States
  const [isEditMasterOpen, setIsEditMasterOpen] = useState(false);
  const [editMasterRow, setEditMasterRow] = useState<any>(null);
  const [emUnit, setEmUnit] = useState("");
  const [emPrice, setEmPrice] = useState("");
  const [emVendor, setEmVendor] = useState("");
  const [emMinQty, setEmMinQty] = useState("");
  const [emSafety, setEmSafety] = useState("");
  const [emGst, setEmGst] = useState("");
  const [emRack, setEmRack] = useState("");
  const [metaOpts, setMetaOpts] = useState<{ units: string[], vendors: string[] }>({ units: [], vendors: [] });
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [emSubmitting, setEmSubmitting] = useState(false);

  const fetchMetaOpts = async () => {
    setIsMetaLoading(true);
    try {
      const res = await fetch("/api/indent?action=meta");
      const json = await res.json();
      if (json.success) {
        setMetaOpts({ units: json.units || [], vendors: json.vendors || [] });
      }
    } catch(e) {}
    setIsMetaLoading(false);
  };

  const handleEditMasterSave = async () => {
    if (!editMasterRow) return;
    const itemName = editMasterRow["Item Name"];
    setEmSubmitting(true);
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDIT_ITEM_MASTER",
          itemName: itemName,
          updatedFields: {
            unit: emUnit,
            price: emPrice,
            vendor: emVendor,
            minQty: emMinQty,
            safetyFactor: emSafety,
            gst: emGst,
            rackNo: emRack
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        showAlert("Master Data Updated Successfully!", "success");
        setIsEditMasterOpen(false);
        // refresh data to see changes if any reflect in main table
        fetchData(true);
      } else {
        showAlert(data.error || "Update Failed", "error");
      }
    } catch (e: any) {
      showAlert("Network Error: " + e.message, "error");
    } finally {
      setEmSubmitting(false);
    }
  };

  // Debit Note / Reverse Entry Modal State\`;

code = code.replace('  // Debit Note / Reverse Entry Modal State', stateToAdd);


// 2. Make RKD Number clickable
const oldRkdHtml = \`<td><span className={\\\`\${styles.pillId} \${(isLow && status === "Requirement Open") ? styles.pillIdLowStock : ""}\\\`}>{row["Store RKD Number"] || "-"}</span></td>\`;

const newRkdHtml = \`
                          <td onClick={() => {
                            if (status === "Requirement Open") {
                              const itemKey = (row["Item Name"] || "").trim().toLowerCase();
                              const misc = miscMap[itemKey] || { vendor: "", rate: "" };
                              setEditMasterRow(row);
                              setEmUnit(row["Units"] || "");
                              setEmPrice(misc.rate || "");
                              setEmVendor(misc.vendor || "");
                              setEmMinQty("");
                              setEmSafety("");
                              setEmGst("");
                              setEmRack("");
                              setIsEditMasterOpen(true);
                              fetchMetaOpts();
                            }
                          }}>
                            <span 
                              className={\\\`\${styles.pillId} \${(isLow && status === "Requirement Open") ? styles.pillIdLowStock : ""}\\\`}
                              style={{ cursor: status === "Requirement Open" ? "pointer" : "default" }}
                              title={status === "Requirement Open" ? "Edit Item Master Data" : ""}
                            >
                              {row["Store RKD Number"] || "-"}
                            </span>
                          </td>
\`.trim();

code = code.replace(oldRkdHtml, newRkdHtml);


// 3. Add Modal Markup
const modalMarkup = \`
      {/* ── Edit Item Master Modal ── */}
      {isEditMasterOpen && editMasterRow && (
        <div className={styles.modalOverlay} onClick={() => setIsEditMasterOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIconBox} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                📦
              </div>
              <div>
                <h3 className={styles.modalTitle}>Edit Master Data</h3>
                <p className={styles.modalSubtitle}>Update item details in Data tab</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setIsEditMasterOpen(false)}>×</button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Item Name <span style={{fontSize:'0.75rem', color:'#94a3b8'}}>(Read-only)</span></label>
              <input type="text" className={styles.formInput} value={editMasterRow["Item Name"]} disabled style={{ background:'#f1f5f9', color:'#64748b' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Unit</label>
                <input type="text" list="emUnitsList" className={styles.formInput} value={emUnit} onChange={e => setEmUnit(e.target.value)} placeholder="Select/Add" />
                <datalist id="emUnitsList">{metaOpts.units.map(u => <option key={u} value={u}/>)}</datalist>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Price Per Unit (₹)</label>
                <input type="number" className={styles.formInput} value={emPrice} onChange={e => setEmPrice(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Party Name (Vendor)</label>
              <input type="text" list="emVendorsList" className={styles.formInput} value={emVendor} onChange={e => setEmVendor(e.target.value)} placeholder="Select/Add Vendor" />
              <datalist id="emVendorsList">{metaOpts.vendors.map(v => <option key={v} value={v}/>)}</datalist>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Min Qty</label>
                <input type="number" className={styles.formInput} value={emMinQty} onChange={e => setEmMinQty(e.target.value)} placeholder="0" />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Safety Factor</label>
                <input type="number" className={styles.formInput} value={emSafety} onChange={e => setEmSafety(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>GST</label>
                <select className={styles.formInput} value={emGst} onChange={e => setEmGst(e.target.value)}>
                  <option value="">Select</option>
                  <option value="0%">0%</option>
                  <option value="5%">5%</option>
                  <option value="12%">12%</option>
                  <option value="18%">18%</option>
                  <option value="28%">28%</option>
                </select>
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.formLabel}>Rack No</label>
                <input type="text" className={styles.formInput} value={emRack} onChange={e => setEmRack(e.target.value)} placeholder="Rack No" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className={styles.dribbbleBtnPrimary} style={{ flex: 1, justifyContent: 'center' }} disabled={emSubmitting} onClick={handleEditMasterSave}>
                {emSubmitting ? <Loader2 className={styles.btnSpin} size={18} /> : <span>💾</span>}
                <span>Save Master Data</span>
              </button>
            </div>
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
               <a href="/indent" target="_blank" style={{ fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
                 + Add New Item to Master
               </a>
            </div>
          </div>
        </div>
      )}

      {/* Modern Alert Modal — replaces all browser alert() */}
\`;

code = code.replace('{/* Modern Alert Modal — replaces all browser alert() */}', modalMarkup);

fs.writeFileSync('src/app/page.tsx', code);
