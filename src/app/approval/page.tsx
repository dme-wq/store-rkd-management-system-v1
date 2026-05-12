"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "../page.module.css";
import { Search, Loader2, Filter, ArrowLeft, Edit2, CheckCircle } from "lucide-react";
import Select from "react-select";

export default function ApprovalEntries() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // Full screen state
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef<HTMLDivElement>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selRKD, setSelRKD] = useState<any>(null);
  const [selVendor, setSelVendor] = useState<any>(null);
  const [selApproval, setSelApproval] = useState<any>(null);

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [editQty, setEditQty] = useState("");
  const [updatingRowId, setUpdatingRowId] = useState<number | null>(null);

  const isEditable = (timestampStr: string) => {
    if (!timestampStr || timestampStr === "-") return false;
    const t = new Date(timestampStr).getTime();
    if (isNaN(t)) return false;
    return (Date.now() - t) / (1000 * 60) <= 30;
  };

  const handleEditSubmit = async () => {
    if (!editingRow || !editQty) return;
    setUpdatingRowId(editingRow._id);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDIT_QTY",
          approvalRowNumber: editingRow.rowNumber,
          rkdNumber: editingRow["Store RKD Number"],
          newQty: editQty
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      
      // Update local state
      setData(prev => prev.map(r => r._id === editingRow._id ? { ...r, "Approved Qty": editQty } : r));
      setIsEditModalOpen(false);
      alert("Quantity updated successfully!");
    } catch (err: any) {
      alert("Failed to update: " + err.message);
    } finally {
      setUpdatingRowId(null);
      setEditingRow(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approval");
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        setApiError(null);
      } else {
        setApiError(json.error || "Failed to fetch approval data");
      }
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleFullScreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await fullScreenRef.current?.requestFullscreen();
      } catch (err) {
        console.error("Fullscreen API failed", err);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Filter options
  const rkdOptions = useMemo(() => {
    const s = new Set<string>();
    data.forEach(r => { if (r["Store RKD Number"]) s.add(r["Store RKD Number"]); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data]);

  const vendorOptions = useMemo(() => {
    const s = new Set<string>();
    data.forEach(r => { if (r["Vendor Name"]) s.add(r["Vendor Name"]); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data]);

  const approvalOptions = [
    { value: "Yes", label: "Yes" },
    { value: "No", label: "No" },
  ];

  const filteredData = useMemo(() => {
    let result = data;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r => 
        (r["Store RKD Number"] || "").toLowerCase().includes(q) ||
        (r["Vendor Name"] || "").toLowerCase().includes(q)
      );
    }
    if (selRKD) result = result.filter(r => r["Store RKD Number"] === selRKD.value);
    if (selVendor) result = result.filter(r => r["Vendor Name"] === selVendor.value);
    if (selApproval) result = result.filter(r => r["Approval Require?"] === selApproval.value);
    return result;
  }, [data, searchTerm, selRKD, selVendor, selApproval]);

  const ss = {
    control: (provided: any) => ({
      ...provided,
      borderRadius: '8px',
      borderColor: '#e2e8f0',
      boxShadow: 'none',
      '&:hover': { borderColor: '#cbd5e1' },
      minHeight: '38px',
      fontSize: '0.85rem'
    }),
    option: (provided: any) => ({ ...provided, fontSize: '0.85rem' }),
    singleValue: (provided: any) => ({ ...provided, fontSize: '0.85rem' }),
    menu: (provided: any) => ({ ...provided, zIndex: 9999 })
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
      {!isFullScreen && (
        <header className={styles.topHeader}>
          <div className={styles.headerLeft}>
            <button className={styles.dribbbleBtnSecondary} style={{ padding: '8px 12px', border: 'none', background: 'transparent', boxShadow: 'none' }} onClick={() => { setIsNavigating(true); router.push("/"); }}>
              <ArrowLeft size={16} /> Dashboard
            </button>
            <h1 className={styles.headerTitle} style={{ marginLeft: '10px' }}>Approval Entries Database</h1>
          </div>
        </header>
      )}

      {/* Main Layout */}
      <div className={styles.presentationLayout} style={isFullScreen ? { padding: 0 } : {}}>
        <div className={styles.appCardSide} style={isFullScreen ? { margin: 0, width: '100%' } : {}}>
          <div className={styles.appCard} style={isFullScreen ? { borderRadius: 0, height: '100vh' } : {}}>
            
            {!isFullScreen && (
              <div className={styles.appHeader} style={{ padding: '1rem 1.5rem', flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className={styles.liveTitle} style={{ fontSize: '1.2rem', margin: 0 }}>Smart Filters</h2>
                  <button onClick={toggleFullScreen} className={styles.dribbbleBtnSecondary}>
                    <span>⛶</span>
                    <span>Full Screen</span>
                  </button>
                </div>
                
                {/* Filters */}
                <div className={styles.filterRow} style={{ marginTop: '10px' }}>
                  <div className={styles.searchBox} style={{ flex: 1, minWidth: '200px' }}>
                    <Search className={styles.searchIcon} size={14} />
                    <input 
                      type="text" 
                      placeholder="Search RKD or Vendor..." 
                      className={styles.searchInput}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select instanceId="rkd-filter" options={rkdOptions} value={selRKD} onChange={setSelRKD} styles={ss} placeholder="RKD Number" isClearable className={styles.selectWrap} />
                  <Select instanceId="vendor-filter" options={vendorOptions} value={selVendor} onChange={setSelVendor} styles={ss} placeholder="Vendor" isClearable className={styles.selectWrap} />
                  <Select instanceId="approval-filter" options={approvalOptions} value={selApproval} onChange={setSelApproval} styles={ss} placeholder="Approval Required?" isClearable className={styles.selectWrap} />
                </div>
              </div>
            )}

            {/* Table Area */}
            <div 
              ref={fullScreenRef}
              style={isFullScreen ? {
                backgroundColor: '#f1f5f9', 
                padding: '24px',
                display: 'flex', 
                flexDirection: 'column',
                width: '100vw',
                height: '100vh',
                overflow: 'hidden'
              } : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '0 1.5rem 1.5rem' }}
            >
              {isFullScreen && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.4rem' }}>🔴 LIVE</span> Approval Database
                  </h2>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Select instanceId="fs-rkd-filter" options={rkdOptions} value={selRKD} onChange={setSelRKD} styles={ss} placeholder="RKD Number" isClearable />
                    <Select instanceId="fs-vendor-filter" options={vendorOptions} value={selVendor} onChange={setSelVendor} styles={ss} placeholder="Vendor" isClearable />
                    <button onClick={toggleFullScreen} className={styles.dribbbleBtnPrimary} style={{ background: '#ef4444', color: 'white', border: 'none', boxShadow: '0 4px 14px rgba(239,68,68,0.4)', padding: '10px 20px', fontSize: '1rem' }}>
                      Exit Full Screen ✖
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.tableScrollArea} style={{ flex: 1, maxHeight: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
                {loading && data.length === 0 ? (
                  <div className={styles.loaderCenter}>
                    <Loader2 className={styles.spinnerIcon} size={32} />
                    <p>Fetching Approvals...</p>
                  </div>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Store RKD Number</th>
                        <th>Vendor Name</th>
                        <th>Rate</th>
                        <th>Approval Require?</th>
                        <th>Approved Qty</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody className={styles.dataTableBody}>
                      {filteredData.map((row) => (
                        <tr key={row._id}>
                          <td className={styles.colMuted}>{row["Timestamp"] || "-"}</td>
                          <td><span className={styles.pillId} style={{ background: '#e0e7ff', color: '#4338ca' }}>{row["Store RKD Number"] || "-"}</span></td>
                          <td className={styles.colBold}>{row["Vendor Name"] || "-"}</td>
                          <td className={styles.colBold} style={{ color: '#10b981' }}>{row["Rate"] || "-"}</td>
                          <td>
                            <span className={styles.pillReq} style={row["Approval Require?"] === "Yes" ? { background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5' } : {}}>
                              {row["Approval Require?"] || "-"}
                            </span>
                          </td>
                          <td><span className={styles.pillIss}>{row["Approved Qty"] || "-"}</span></td>
                          <td className={styles.actionCell}>
                            <button 
                              className={styles.manualBtn} 
                              onClick={() => {
                                setEditingRow(row);
                                setEditQty(row["Approved Qty"] || "");
                                setIsEditModalOpen(true);
                              }}
                              disabled={updatingRowId === row._id || !isEditable(row["Timestamp"])}
                              style={{ opacity: isEditable(row["Timestamp"]) ? 1 : 0.5, cursor: isEditable(row["Timestamp"]) ? 'pointer' : 'not-allowed' }}
                              title={isEditable(row["Timestamp"]) ? "Edit Quantity" : "Editing locked after 30 mins"}
                            >
                              {updatingRowId === row._id ? <Loader2 className={styles.btnSpin} size={14} /> : <Edit2 size={14} />}
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                      {apiError && (
                        <tr>
                          <td colSpan={7} className={styles.noDataCell} style={{ color: '#ef4444' }}>
                            <p>Error: {apiError}</p>
                            <button onClick={() => fetchData()} className={styles.dribbbleBtnSecondary} style={{ margin: '10px auto' }}>Retry</button>
                          </td>
                        </tr>
                      )}
                      {!apiError && filteredData.length === 0 && (
                        <tr>
                          <td colSpan={7} className={styles.noDataCell}>
                            <Filter size={32} />
                            <p>No matching records found.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingRow && (
        <div className={styles.modalOverlay} onClick={() => setIsEditModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIconBox} style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Edit2 size={32} />
              </div>
            </div>
            <h3 className={styles.modalTitle}>Edit Approved Quantity</h3>
            <p className={styles.modalMessage}>You can edit the quantity within 30 minutes of approval.</p>

            <div className={styles.formInfoBox}>
              <div className={styles.modalInfoItem}><span className={styles.modalLabel}>RKD:</span> <span className={styles.modalValue}>{editingRow["Store RKD Number"]}</span></div>
              <div className={styles.modalInfoItem}><span className={styles.modalLabel}>Vendor:</span> <span className={styles.modalValue}>{editingRow["Vendor Name"]}</span></div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>✏️ New Quantity</label>
              <input
                type="number"
                className={styles.formInput}
                value={editQty}
                onChange={e => setEditQty(e.target.value)}
                placeholder="Enter new quantity"
              />
            </div>

            <button
              className={styles.submitBtn}
              onClick={handleEditSubmit}
              disabled={updatingRowId !== null || !editQty}
              style={{ background: '#2563eb' }}
            >
              {updatingRowId !== null ? <Loader2 className={styles.btnSpin} size={16} /> : <CheckCircle size={16} />}
              {updatingRowId !== null ? "Updating..." : "Update Quantity"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
