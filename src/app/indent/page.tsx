"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Select from "react-select";
import { Search, Plus, Filter, CheckSquare, X, RefreshCw, Share2, Settings, ChevronRight, Package, Users, Building, Cpu, UserCircle, Trash2 } from "lucide-react";
import styles from "./indent.module.css";

// ── Toast System ──
type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: number; type: ToastType; message: string; }

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className={styles.toastContainer}>
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.type}`]}`}>
          {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warning" ? "⚠️" : "ℹ️"}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

const toOpts = (arr: string[]) => arr.map(a => ({ value: a, label: a }));

export default function IndentMasterDetail() {
  const [pageLoading, setPageLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Data
  const [masterData, setMasterData] = useState<any[]>([]);
  const [options, setOptions] = useState<any>({
    persons: [], departments: [], machineNames: [], machineIDs: [],
    items: [], itemMap: {}
  });

  // UI State
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Master Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeMasterModal, setActiveMasterModal] = useState<string | null>(null);
  const [masterSubmitting, setMasterSubmitting] = useState(false);
  const [metaOpts, setMetaOpts] = useState<{units: string[], vendors: string[]}>({ units: [], vendors: [] });
  
  // Master Form States
  const [singleValue, setSingleValue] = useState("");
  const [vendorForm, setVendorForm] = useState({
    vendorName: "", contactPerson: "", contactNumber: "", email: "", gstDetails: "", address: "", paymentTerms: ""
  });
  const [itemRows, setItemRows] = useState([{
    itemName: "", openingStock: "", unit: "", price: "", vendor: "", delivery: "", minQty: "", safetyFactor: "", gst: "", rackNo: ""
  }]);

  // Form State
  const [form, setForm] = useState({
    personFillingName: "", department: "",
    machineName: "", machineId: "",
    itemName: "", requireQty: ""
  });

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const setF = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const itemData = form.itemName && options.itemMap[form.itemName]
    ? options.itemMap[form.itemName]
    : { units: "", rate: "", vendor: "", stock: "" };

  const loadData = async (silent = false) => {
    if (!silent) setPageLoading(true);
    setSyncing(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      // Use dedicated fast list endpoint — last 500 rows only (~3 months)
      const [resSheets, resOptions] = await Promise.all([
        fetch(`/api/indent?action=list&t=${Date.now()}`, { signal: controller.signal }),
        fetch(`/api/indent?t=${Date.now()}`),
      ]);
      clearTimeout(timer);

      const jsonSheets = await resSheets.json();
      if (jsonSheets.success && jsonSheets.data) {
        setMasterData(jsonSheets.data);
      }

      const jsonOptions = await resOptions.json();
      if (jsonOptions.success) {
        setOptions(jsonOptions.options);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Timeout — keep existing data, don't clear it!
        showToast("warning", "Slow connection — showing last loaded data.");
      } else {
        showToast("error", "Failed to load data.");
      }
    } finally {
      setPageLoading(false);
      setSyncing(false);
    }
  };

  const loadMeta = async () => {
    try {
      const res = await fetch(`/api/indent?action=meta`);
      const json = await res.json();
      if (json.success) {
        setMetaOpts({ units: json.units, vendors: json.vendors });
      }
    } catch(e) {}
  };

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, []);

  // Show all recent data (last 500 rows from API) with search filter
  const filteredData = useMemo(() => {
    if (!search.trim()) return masterData;
    const q = search.toLowerCase();
    return masterData.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(q))
    );
  }, [masterData, search]);

  // ── react-select AppSheet styles ──
  const mkSelectStyles = () => ({
    control: (b: any, s: any) => ({
      ...b,
      minHeight: "42px",
      border: s.isFocused ? "2px solid var(--appsheet-green)" : "1px solid var(--table-border)",
      borderRadius: "4px",
      boxShadow: "none",
      "&:hover": { borderColor: "var(--appsheet-green)" },
      fontFamily: "'Outfit', sans-serif",
      fontSize: "0.9rem"
    }),
    option: (b: any, s: any) => ({
      ...b,
      backgroundColor: s.isSelected ? "var(--appsheet-green)" : s.isFocused ? "#e8f5e9" : "white",
      color: s.isSelected ? "white" : "#333",
      fontFamily: "'Outfit', sans-serif",
      fontSize: "0.9rem"
    })
  });
  const selStyle = mkSelectStyles();

  const handleSave = async () => {
    if (!form.personFillingName || !form.department || !form.itemName || !form.requireQty) {
      showToast("warning", "Please fill all required (*) fields.");
      return;
    }

    // ── OPTIMISTIC SUBMIT ──
    const payload = {
      personFillingName: form.personFillingName, department: form.department,
      machineName: form.machineName, machineId: form.machineId,
      itemName: form.itemName, requireQty: form.requireQty,
      units: itemData.units, vendorName: itemData.vendor,
      price: itemData.rate, stockInStore: itemData.stock
    };

    // 1. Close drawer & reset form immediately — instant UX
    setIsFormOpen(false);
    setForm({ personFillingName: "", department: "", machineName: "", machineId: "", itemName: "", requireQty: "" });
    showToast("info", "Saving indent...");

    // 2. Fire API in background
    fetch("/api/indent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(res => res.json()).then(data => {
      if (data.success) {
        showToast("success", `✅ Indent ${data.rkdNumber} Saved!`);
        // Optimistic UI: prepend the new row
        if (data.rowData) setMasterData(prev => [data.rowData, ...prev]);
        // Background sync to get server-confirmed data
        setTimeout(() => fetch("/api/sheets"), 3000);
      } else {
        showToast("error", data.error || "Save failed. Please retry.");
      }
    }).catch(() => {
      showToast("error", "Network error. Please retry.");
    });
  };

  const adjQty = (delta: number) => {
    const current = parseFloat(form.requireQty || "0");
    const next = Math.max(0, current + delta);
    setF("requireQty", next > 0 ? next.toString() : "");
  };

  // ── Master Submit Logic ──
  const closeMasterModal = () => {
    setActiveMasterModal(null);
    setSingleValue("");
    setItemRows([{ itemName: "", openingStock: "", unit: "", price: "", vendor: "", delivery: "", minQty: "", safetyFactor: "", gst: "", rackNo: "" }]);
    setVendorForm({ vendorName: "", contactPerson: "", contactNumber: "", email: "", gstDetails: "", address: "", paymentTerms: "" });
  };

  const handleMasterSubmit = async () => {
    let payload: any[] = [];
    const ts = new Date().toLocaleString("en-US");
    
    if (activeMasterModal === "item") {
       const validRows = itemRows.filter(r => r.itemName.trim() !== "");
       if (validRows.length === 0) return showToast("warning", "Please add at least one item name.");
       payload = validRows.map(r => [
          ts, r.itemName, r.openingStock, r.unit, r.price, r.vendor, r.delivery, r.minQty, r.safetyFactor, r.gst, r.rackNo
       ]);
    } else if (activeMasterModal === "vendor") {
       if (!vendorForm.vendorName) return showToast("warning", "Vendor name is required.");
       payload = [[
          "", vendorForm.vendorName, vendorForm.contactPerson, vendorForm.contactNumber, 
          vendorForm.email, vendorForm.gstDetails, vendorForm.address, vendorForm.paymentTerms
       ]];
    } else {
       if (!singleValue.trim()) return showToast("warning", "Please enter a value.");
       payload = [[singleValue]];
    }

    setMasterSubmitting(true);
    try {
       const res = await fetch("/api/indent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "master-add", type: activeMasterModal, payload })
       });
       const json = await res.json();
       if (json.success) {
          showToast("success", "Added successfully!");
          closeMasterModal();
          loadData(true);
       } else {
          showToast("error", json.error || "Failed to add data.");
       }
    } catch(e: any) {
       showToast("error", "Network error.");
    } finally {
       setMasterSubmitting(false);
    }
  };

  if (pageLoading && masterData.length === 0) {
    return (
      <div className={styles.page} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw className={styles.syncSpinner} size={32} color="var(--appsheet-green)" />
        <p style={{ marginTop: 16, color: "var(--appsheet-green)", fontWeight: 500 }}>Loading App...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ToastContainer toasts={toasts} />

      {/* ── Top Header ── */}
      <div className={styles.appHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerLogoBox}>RKD<br/>GROUP</div>
          <h1 className={styles.headerTitle}>Store Miscellaneous Indent</h1>
        </div>
        
        <div className={styles.headerCenter}>
          <Search className={styles.searchIcon} size={18} />
          <input 
            type="text" 
            className={styles.searchBar} 
            placeholder="Search Indent Details" 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.headerRight}>
          <div className={styles.syncText}>
            {syncing ? (
              <><span className={styles.syncSpinner}></span> Syncing...</>
            ) : "Synced"}
          </div>
          <div className={styles.avatar}>D</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <h2 className={styles.toolbarTitle}>Indent Details</h2>
        <div className={styles.toolbarActions}>
          <button className={styles.addBtn} onClick={() => window.open('/indent/form', '_blank')} style={{ background: 'white', color: 'var(--appsheet-green)', border: '1px solid var(--appsheet-green)' }}>
            <Share2 size={16} /> Share Form Link
          </button>
          <button className={styles.addBtn} onClick={() => setIsFormOpen(true)}>
            <Plus size={16} /> Add
          </button>
          <button className={styles.iconBtn}><Filter size={18} /></button>
          <button className={styles.iconBtn}><CheckSquare size={18} /></button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Timestamp ↓</th>
              <th>Person Filing Name</th>
              <th>Item Name</th>
              <th>Require Qty</th>
              <th>Department</th>
              <th>Machine Name</th>
              <th>Machine ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row: any) => (
              <tr key={row._id}>
                <td>{row["Timestamp"]}</td>
                <td>{row["Person Filling Name"]}</td>
                <td>{row["Item Name"]}</td>
                <td>{row["Require Qty"]}</td>
                <td>{row["Department"]}</td>
                <td>{row["Machine Name"]}</td>
                <td>{row["Machine ID"]}</td>
                <td className={styles.chevron}>›</td>
              </tr>
            ))}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "#999", padding: 32 }}>
                  No indents found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Drawer Form ── */}
      {isFormOpen && (
        <div className={styles.drawerOverlay} onClick={() => setIsFormOpen(false)}>
          <div className={styles.drawerContent} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitleBox}>
                <button className={styles.drawerClose} onClick={() => setIsFormOpen(false)}><X size={20}/></button>
                <h3 className={styles.drawerTitle}>Data Form</h3>
              </div>
              <div className={styles.drawerActions}>
                <button className={styles.btnCancel} onClick={() => setIsFormOpen(false)}>Cancel</button>
                <button className={styles.btnSave} onClick={handleSave} disabled={submitting}>
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <div className={styles.drawerBody}>
              
              <div className={styles.formField}>
                <label className={styles.label}>Person Filing Name <span className={styles.req}>*</span></label>
                <Select
                  options={toOpts(options.persons)}
                  styles={selStyle} isClearable
                  placeholder="Add or search"
                  value={form.personFillingName ? { value: form.personFillingName, label: form.personFillingName } : null}
                  onChange={(o: any) => setF("personFillingName", o?.value || "")}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Item Name <span className={styles.req}>*</span></label>
                <Select
                  options={toOpts(options.items)}
                  styles={selStyle} isClearable isSearchable
                  placeholder="Add or search"
                  value={form.itemName ? { value: form.itemName, label: form.itemName } : null}
                  onChange={(o: any) => setF("itemName", o?.value || "")}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Require Qty <span className={styles.req}>*</span></label>
                <div className={styles.qtyWrapper}>
                  <input 
                    type="number" 
                    className={styles.qtyInput} 
                    value={form.requireQty} 
                    onChange={e => setF("requireQty", e.target.value)} 
                    placeholder="0.00" 
                  />
                  <button className={styles.qtyBtn} onClick={() => adjQty(-1)}>−</button>
                  <button className={styles.qtyBtn} onClick={() => adjQty(1)}>+</button>
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Department <span className={styles.req}>*</span></label>
                <Select
                  options={toOpts(options.departments)}
                  styles={selStyle} isClearable
                  placeholder="Add or search"
                  value={form.department ? { value: form.department, label: form.department } : null}
                  onChange={(o: any) => setF("department", o?.value || "")}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Machine Name</label>
                <Select
                  options={toOpts(options.machineNames)}
                  styles={selStyle} isClearable
                  placeholder="Add or search"
                  value={form.machineName ? { value: form.machineName, label: form.machineName } : null}
                  onChange={(o: any) => setF("machineName", o?.value || "")}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Machine ID</label>
                <Select
                  options={toOpts(options.machineIDs)}
                  styles={selStyle} isClearable
                  placeholder="Add or search"
                  value={form.machineId ? { value: form.machineId, label: form.machineId } : null}
                  onChange={(o: any) => setF("machineId", o?.value || "")}
                />
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar Toggle ── */}
      <button 
        className={`${styles.sidebarToggle} ${isSidebarOpen ? styles.hidden : ""}`}
        onClick={() => { setIsSidebarOpen(true); loadMeta(); }}
      >
        <Settings size={20} />
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.8rem', letterSpacing: 1 }}>MANAGE</span>
      </button>

      {/* ── Sidebar ── */}
      <div className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ""}`}>
        <div className={styles.sidebarHeader}>
          <h3 className={styles.sidebarTitle}>Master Data</h3>
          <button className={styles.iconBtn} onClick={() => setIsSidebarOpen(false)}><X size={20} /></button>
        </div>
        <div className={styles.sidebarBody}>
          <button className={styles.sidebarBtn} onClick={() => setActiveMasterModal("item")}>
            <Package size={18} /> Add Item Details <ChevronRight size={16} style={{marginLeft: "auto", color: "#cbd5e1"}}/>
          </button>
          <button className={styles.sidebarBtn} onClick={() => setActiveMasterModal("vendor")}>
            <Users size={18} /> Add Vendor List <ChevronRight size={16} style={{marginLeft: "auto", color: "#cbd5e1"}}/>
          </button>
          <button className={styles.sidebarBtn} onClick={() => setActiveMasterModal("department")}>
            <Building size={18} /> Add Department <ChevronRight size={16} style={{marginLeft: "auto", color: "#cbd5e1"}}/>
          </button>
          <button className={styles.sidebarBtn} onClick={() => setActiveMasterModal("machineName")}>
            <Cpu size={18} /> Add Machine Name <ChevronRight size={16} style={{marginLeft: "auto", color: "#cbd5e1"}}/>
          </button>
          <button className={styles.sidebarBtn} onClick={() => setActiveMasterModal("machineId")}>
            <Cpu size={18} /> Add Machine ID <ChevronRight size={16} style={{marginLeft: "auto", color: "#cbd5e1"}}/>
          </button>
          <button className={styles.sidebarBtn} onClick={() => setActiveMasterModal("person")}>
            <UserCircle size={18} /> Add Person Name <ChevronRight size={16} style={{marginLeft: "auto", color: "#cbd5e1"}}/>
          </button>
        </div>
      </div>

      {/* ── Master Modals ── */}
      {activeMasterModal && (
        <div className={styles.masterModalOverlay} onClick={closeMasterModal}>
          <div className={`${styles.masterModal} ${activeMasterModal === "item" ? styles.large : ""}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {activeMasterModal === "item" && "Add Item Details"}
                {activeMasterModal === "vendor" && "Add Vendor"}
                {activeMasterModal === "department" && "Add Department"}
                {activeMasterModal === "machineName" && "Add Machine Name"}
                {activeMasterModal === "machineId" && "Add Machine ID"}
                {activeMasterModal === "person" && "Add Person Name"}
              </h3>
              <button className={styles.iconBtn} onClick={closeMasterModal}><X size={20} /></button>
            </div>
            
            <div className={styles.modalBody}>
              {activeMasterModal === "item" && (
                <div className={styles.itemTableWrap}>
                  <table className={styles.itemTable}>
                    <thead>
                      <tr>
                        <th>Item Name *</th>
                        <th>Op. Stock</th>
                        <th>Unit</th>
                        <th>Price/Unit</th>
                        <th>Party Name</th>
                        <th>Delivery (days)</th>
                        <th>Min Qty</th>
                        <th>Safety Factor</th>
                        <th>GST</th>
                        <th>Rack No</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemRows.map((row, idx) => (
                        <tr key={idx}>
                          <td><input type="text" value={row.itemName} onChange={e => { const r = [...itemRows]; r[idx].itemName = e.target.value; setItemRows(r); }} placeholder="Name" /></td>
                          <td><input type="number" value={row.openingStock} onChange={e => { const r = [...itemRows]; r[idx].openingStock = e.target.value; setItemRows(r); }} placeholder="0" /></td>
                          <td>
                            <input type="text" list="unitsList" value={row.unit} onChange={e => { const r = [...itemRows]; r[idx].unit = e.target.value; setItemRows(r); }} placeholder="Select/Add" />
                            <datalist id="unitsList">{metaOpts.units.map(u => <option key={u} value={u}/>)}</datalist>
                          </td>
                          <td><input type="number" value={row.price} onChange={e => { const r = [...itemRows]; r[idx].price = e.target.value; setItemRows(r); }} placeholder="0.00" /></td>
                          <td>
                            <input type="text" list="vendorsList" value={row.vendor} onChange={e => { const r = [...itemRows]; r[idx].vendor = e.target.value; setItemRows(r); }} placeholder="Select/Add" />
                            <datalist id="vendorsList">{metaOpts.vendors.map(v => <option key={v} value={v}/>)}</datalist>
                          </td>
                          <td><input type="number" value={row.delivery} onChange={e => { const r = [...itemRows]; r[idx].delivery = e.target.value; setItemRows(r); }} placeholder="Days" /></td>
                          <td><input type="number" value={row.minQty} onChange={e => { const r = [...itemRows]; r[idx].minQty = e.target.value; setItemRows(r); }} placeholder="0" /></td>
                          <td><input type="number" value={row.safetyFactor} onChange={e => { const r = [...itemRows]; r[idx].safetyFactor = e.target.value; setItemRows(r); }} placeholder="0" /></td>
                          <td>
                            <select value={row.gst} onChange={e => { const r = [...itemRows]; r[idx].gst = e.target.value; setItemRows(r); }}>
                              <option value="">Select</option><option value="0%">0%</option><option value="5%">5%</option>
                              <option value="12%">12%</option><option value="18%">18%</option><option value="28%">28%</option>
                            </select>
                          </td>
                          <td><input type="text" value={row.rackNo} onChange={e => { const r = [...itemRows]; r[idx].rackNo = e.target.value; setItemRows(r); }} placeholder="Rack" /></td>
                          <td>
                            {itemRows.length > 1 && (
                              <button className={styles.iconBtn} onClick={() => setItemRows(itemRows.filter((_, i) => i !== idx))}><Trash2 size={16} color="red"/></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className={styles.addRowBtn} onClick={() => setItemRows([...itemRows, { itemName: "", openingStock: "", unit: "", price: "", vendor: "", delivery: "", minQty: "", safetyFactor: "", gst: "", rackNo: "" }])}>
                    + Add Another Item
                  </button>
                </div>
              )}

              {activeMasterModal === "vendor" && (
                <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  <div className={styles.formField}><label className={styles.label}>Vendor Name *</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.vendorName} onChange={e => setVendorForm({...vendorForm, vendorName: e.target.value})} /></div>
                  <div className={styles.formField}><label className={styles.label}>Contact Person</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.contactPerson} onChange={e => setVendorForm({...vendorForm, contactPerson: e.target.value})} /></div>
                  <div className={styles.formField}><label className={styles.label}>Contact Number</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.contactNumber} onChange={e => setVendorForm({...vendorForm, contactNumber: e.target.value})} /></div>
                  <div className={styles.formField}><label className={styles.label}>Email Id</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.email} onChange={e => setVendorForm({...vendorForm, email: e.target.value})} /></div>
                  <div className={styles.formField}><label className={styles.label}>GST Details</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.gstDetails} onChange={e => setVendorForm({...vendorForm, gstDetails: e.target.value})} /></div>
                  <div className={styles.formField}><label className={styles.label}>Address</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.address} onChange={e => setVendorForm({...vendorForm, address: e.target.value})} /></div>
                  <div className={styles.formField}><label className={styles.label}>Payment Terms</label><input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={vendorForm.paymentTerms} onChange={e => setVendorForm({...vendorForm, paymentTerms: e.target.value})} /></div>
                </div>
              )}

              {["department", "machineName", "machineId", "person"].includes(activeMasterModal) && (
                <div className={styles.formField}>
                  <label className={styles.label}>Enter Name/ID *</label>
                  <input className={styles.qtyInput} style={{border:'1px solid var(--table-border)'}} type="text" value={singleValue} onChange={e => setSingleValue(e.target.value)} placeholder="Type here..." />
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeMasterModal}>Cancel</button>
              <button className={styles.btnSave} onClick={handleMasterSubmit} disabled={masterSubmitting}>
                {masterSubmitting ? "Saving..." : "Save Data"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
