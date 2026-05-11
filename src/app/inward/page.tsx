"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./inward.module.css";
import { Search, Loader2, Filter, Package, Zap, CheckCircle, ArrowLeft } from "lucide-react";

// Modern Alert Modal
type AlertType = "error" | "warning" | "success" | "info";
function AlertModal({ isOpen, onClose, message, type = "error" }: { isOpen: boolean; onClose: () => void; message: string; type?: AlertType }) {
  if (!isOpen) return null;
  const cfg: Record<AlertType, { icon: string; color: string; bg: string; btnBg: string; title: string }> = {
    error: { icon: "❌", color: "#dc2626", bg: "#fef2f2", btnBg: "#bb0000", title: "Error" },
    warning: { icon: "⚠️", color: "#d97706", bg: "#fffbeb", btnBg: "#e9730c", title: "Warning" },
    success: { icon: "✅", color: "#16a34a", bg: "#f0fdf4", btnBg: "#107e3e", title: "Success" },
    info: { icon: "ℹ️", color: "#2563eb", bg: "#eff6ff", btnBg: "#0854a0", title: "Notice" },
  };
  const c = cfg[type];
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: c.bg, color: c.color }}>{c.icon}</div>
        </div>
        <h3 className={styles.modalTitle}>{c.title}</h3>
        <p className={styles.modalMessage}>{message}</p>
        <button onClick={onClose} className={styles.submitBtn} style={{ background: c.btnBg }}>OK, Got it!</button>
      </div>
    </div>
  );
}

// Manual Inward Modal
function ManualInwardModal({ isOpen, onClose, row, onSubmit, updating }: any) {
  const [inwardQty, setInwardQty] = useState("");
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (row) {
      setInwardQty(row["Received Qty"] || "");
      setRate(row.autoRate || "");
    }
  }, [row]);

  if (!isOpen || !row) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalIconBox} style={{ background: '#dcfce7', color: '#16a34a' }}>
            <Package size={32} />
          </div>
        </div>
        <h3 className={styles.modalTitle}>Manual Inward 📦</h3>
        <p className={styles.modalMessage}>Review details and finalize inward entry.</p>

        <div className={styles.formInfoBox}>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>RKD Number:</span> <span className={styles.modalValue}>{row["Indent Request Number"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Item:</span> <span className={styles.modalValue}>{row["Item Name"]}</span></div>
          <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Vendor:</span> <span className={styles.modalValue}>{row["Vendor Name"]}</span></div>
          <div className={styles.modalInfoItem} style={{ borderTop: '1px solid #e5e7eb', marginTop: '8px', paddingTop: '8px' }}>
            <span className={styles.modalLabel}>Gate Received:</span> <span className={styles.modalValue} style={{ color: '#2563eb' }}>{row["Received Qty"]} {row["Units"]}</span>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>✏️ Inward Quantity</label>
          <input
            type="number"
            className={styles.formInput}
            value={inwardQty}
            onChange={e => setInwardQty(e.target.value)}
            placeholder="Enter inward quantity"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>🔒 Rate <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 400 }}>(Auto-filled)</span></label>
          <input
            type="text"
            className={styles.formInput}
            value={rate}
            readOnly
            style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed', borderColor: '#e5e7eb', borderStyle: 'dashed' }}
            placeholder="Auto-fetched rate"
          />
        </div>

        <button
          className={styles.submitBtn}
          onClick={() => onSubmit(inwardQty, rate)}
          disabled={updating || !inwardQty}
        >
          {updating ? <Loader2 className={styles.btnSpin} size={16} /> : <CheckCircle size={16} />}
          {updating ? "Submitting..." : "Submit Inward"}
        </button>
      </div>
    </div>
  );
}

export default function InwardEntrySystem() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [updatingRowId, setUpdatingRowId] = useState<number | null>(null);

  // Alert Modal
  const [alertModal, setAlertModal] = useState<{ open: boolean; msg: string; type: AlertType }>({ open: false, msg: "", type: "error" });
  const showAlert = (msg: string, type: AlertType = "error") => setAlertModal({ open: true, msg, type });

  // Manual Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualRow, setManualRow] = useState<any>(null);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/inward");
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setApiError(null);
      } else {
        setApiError(json.error || "Failed to fetch inward data");
      }
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 20000);
    return () => clearInterval(interval);
  }, []);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const q = searchTerm.toLowerCase();
    return data.filter(row => 
      (row["Item Name"] || "").toLowerCase().includes(q) ||
      (row["Indent Request Number"] || "").toLowerCase().includes(q) ||
      (row["Vendor Name"] || "").toLowerCase().includes(q) ||
      (row["Purchase Order Number"] || "").toLowerCase().includes(q)
    );
  }, [data, searchTerm]);

  const handleInstantInward = async (row: any) => {
    const rowId = row._id;
    const qty = row["Received Qty"];
    
    if (!qty) {
      showAlert("Cannot do instant inward without a Received Qty from Gate.", "warning");
      return;
    }

    setUpdatingRowId(rowId);
    
    // Optimistic UI removal
    const originalData = [...data];
    setData(data.filter(r => r._id !== rowId));

    try {
      const res = await fetch("/api/inward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: row.rowNumber,
          inwardQty: qty,
          rate: row.autoRate || ""
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      showAlert(`Inward successful for ${row["Item Name"]}!`, "success");
    } catch (err: any) {
      showAlert("Failed to update: " + err.message, "error");
      setData(originalData); // Rollback
    } finally {
      setUpdatingRowId(null);
    }
  };

  const handleManualSubmit = async (inwardQty: string, rate: string) => {
    if (!manualRow) return;
    
    const rowId = manualRow._id;
    setUpdatingRowId(rowId);
    
    // Optimistic UI removal
    const originalData = [...data];
    setData(data.filter(r => r._id !== rowId));
    setIsManualModalOpen(false);

    try {
      const res = await fetch("/api/inward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowNumber: manualRow.rowNumber,
          inwardQty: inwardQty,
          rate: rate
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      showAlert(`Inward successful for ${manualRow["Item Name"]}!`, "success");
    } catch (err: any) {
      showAlert("Failed to update: " + err.message, "error");
      setData(originalData); // Rollback
    } finally {
      setUpdatingRowId(null);
      setManualRow(null);
    }
  };

  return (
    <div className={styles.pageContainer}>
      {isNavigating && (
        <div className={styles.navigatingOverlay}>
          <div className={styles.navSpinner}></div>
          <div className={styles.navText}>Please wait...</div>
        </div>
      )}

      {/* Header */}
      <header className={styles.topHeader}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => { setIsNavigating(true); router.push("/"); }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <h1 className={styles.headerTitle}>Inward Entry System</h1>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.logoSquare}>
            <span className={styles.logoTextR}>R</span>
            <span className={styles.logoTextK}>K</span>
            <span className={styles.logoTextD}>D</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className={styles.presentationLayout}>
        <div className={styles.appCard}>
          
          {/* App Card Header */}
          <div className={styles.appHeader}>
            <h2 className={styles.liveTitle}>Pending Gate Entries</h2>
          </div>

          {/* Search */}
          <div className={styles.filterRow}>
            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} size={14} />
              <input 
                type="text" 
                placeholder="Search Item, Vendor, PO or RKD Number..." 
                className={styles.searchInput}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableScrollArea}>
            {loading && data.length === 0 ? (
              <div className={styles.loaderCenter}>
                <Loader2 className={styles.spinnerIcon} size={32} />
                <p>Fetching Gate Entries...</p>
              </div>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Gate Entry Date</th>
                    <th>Vendor Name</th>
                    <th>PO Number</th>
                    <th>RKD Store Number</th>
                    <th>Item Name</th>
                    <th>Gate Received</th>
                    <th>Units</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row) => (
                    <tr key={row._id}>
                      <td className={styles.colMuted}>{row["Gate Entry Date"] || "-"}</td>
                      <td className={styles.colBold}>{row["Vendor Name"] || "-"}</td>
                      <td><span className={styles.pillId}>{row["Purchase Order Number"] || "-"}</span></td>
                      <td><span className={styles.pillId} style={{ background: '#e0e7ff', color: '#4338ca' }}>{row["Indent Request Number"] || "-"}</span></td>
                      <td className={styles.colBold}>{row["Item Name"] || "-"}</td>
                      <td><span className={styles.pillReq}>{row["Received Qty"] || "0"}</span></td>
                      <td className={styles.colMuted}>{row["Units"] || "-"}</td>
                      <td className={styles.actionCell}>
                        <button 
                          className={styles.instantBtn}
                          onClick={() => handleInstantInward(row)}
                          disabled={updatingRowId === row._id}
                          title="Instant Inward (Uses Gate Received Qty)"
                        >
                          {updatingRowId === row._id ? <Loader2 className={styles.btnSpin} size={14} /> : <Zap size={14} />}
                          Instant
                        </button>
                        <button 
                          className={styles.manualBtn}
                          onClick={() => { setManualRow(row); setIsManualModalOpen(true); }}
                          disabled={updatingRowId === row._id}
                          title="Manual Inward (Edit Qty & Rate)"
                        >
                          <Package size={14} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {apiError && (
                    <tr>
                      <td colSpan={8} className={styles.noDataCell} style={{ color: '#ef4444' }}>
                        <p>Error: {apiError}</p>
                        <button onClick={() => fetchData(true)} className={styles.manualBtn} style={{ margin: '10px auto' }}>Retry</button>
                      </td>
                    </tr>
                  )}
                  {!apiError && filteredData.length === 0 && (
                    <tr>
                      <td colSpan={8} className={styles.noDataCell}>
                        <Filter size={32} />
                        <p>No pending inward entries found.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ManualInwardModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        row={manualRow}
        onSubmit={handleManualSubmit}
        updating={updatingRowId === manualRow?._id}
      />

      <AlertModal 
        isOpen={alertModal.open}
        onClose={() => setAlertModal(a => ({ ...a, open: false }))}
        message={alertModal.msg}
        type={alertModal.type}
      />
    </div>
  );
}
