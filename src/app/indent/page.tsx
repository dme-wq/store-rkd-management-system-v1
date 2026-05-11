"use client";
import React, { useState, useEffect } from "react";
import Select from "react-select";
import { Check } from "lucide-react";
import styles from "./indent.module.css";

export default function IndentForm() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successRkd, setSuccessRkd] = useState<string | null>(null);

  // Form options from API
  const [options, setOptions] = useState<any>({
    persons: [],
    departments: [],
    machineNames: [],
    machineIDs: [],
    items: [],
    itemMap: {}
  });

  useEffect(() => {
    // Check cache first for instant load
    const cached = localStorage.getItem("indentOptionsCache");
    if (cached) {
      try {
        setOptions(JSON.parse(cached));
        setLoading(false); // Instantly stop loading
      } catch (e) {}
    }

    // Always fetch latest in background
    fetch("/api/indent")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOptions(data.options);
          localStorage.setItem("indentOptionsCache", JSON.stringify(data.options));
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load options", err);
        setLoading(false);
      });
  }, []);


  // Form State
  const [form, setForm] = useState({
    personFillingName: "",
    department: "",
    machineName: "",
    machineId: "",
    itemName: "",
    requireQty: ""
  });

  // Derived state based on selected item
  const selectedItemData = form.itemName && options.itemMap[form.itemName] 
    ? options.itemMap[form.itemName] 
    : { units: "", rate: "", vendor: "", stock: "" };



  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toSelectOptions = (arr: string[]) => arr.map(a => ({ value: a, label: a }));

  const handleSubmit = async () => {
    if (!form.personFillingName || !form.itemName || !form.requireQty || !form.department) {
      alert("Please fill all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        personFillingName: form.personFillingName,
        itemName: form.itemName,
        requireQty: form.requireQty,
        department: form.department,
        machineName: form.machineName,
        machineId: form.machineId,
        units: selectedItemData.units,
        vendorName: selectedItemData.vendor,
        price: selectedItemData.rate,
        stockInStore: selectedItemData.stock
      };

      const res = await fetch("/api/indent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccessRkd(data.rkdNumber);
        // Reset form
        setForm({
          personFillingName: "",
          department: "",
          machineName: "",
          machineId: "",
          itemName: "",
          requireQty: ""
        });
      } else {
        alert("Failed to submit: " + data.error);
      }
    } catch (e: any) {
      alert("Submission Error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingOverlay}>
        <div className={styles.loaderBox}></div>
        <div className={styles.loadingText}>Loading form...</div>
      </div>
    );
  }

  // Common react-select styles for Samsung UI
  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isFocused ? '#ffffff' : '#f2f2f7',
      border: 'none',
      borderRadius: '16px',
      padding: '4px 6px',
      boxShadow: state.isFocused ? '0 0 0 2px #007aff' : 'none',
      fontSize: '1.05rem',
      fontWeight: '500'
    }),
    menu: (base: any) => ({
      ...base,
      borderRadius: '16px',
      border: 'none',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      zIndex: 100
    }),
    option: (base: any, state: any) => ({
      ...base,
      padding: '12px 16px',
      fontWeight: '500',
      backgroundColor: state.isSelected ? '#007aff' : state.isFocused ? '#f2f2f7' : 'white',
      color: state.isSelected ? 'white' : '#1d1d1f'
    })
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.topBlob}></div>
      <div className={styles.bottomBlob}></div>

      <div className={styles.header}>
        <h1 className={styles.headerTitle}>New Indent</h1>
        <div className={styles.headerSubtitle}>We'd love to hear from you! Drop us a requirement, and we'll connect with you soon.</div>
      </div>

      <div className={styles.contentArea}>
        
        {/* User Details Section */}
        <div className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Employee Details</h2>
          
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Person Name <span className={styles.required}>*</span></label>
            <Select 
              options={toSelectOptions(options.persons)} 
              styles={selectStyles}
              placeholder="Select person..."
              value={form.personFillingName ? { value: form.personFillingName, label: form.personFillingName } : null}
              onChange={(o: any) => handleChange("personFillingName", o?.value || "")}
              isClearable
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Department <span className={styles.required}>*</span></label>
            <Select 
              options={toSelectOptions(options.departments)} 
              styles={selectStyles}
              placeholder="Select department..."
              value={form.department ? { value: form.department, label: form.department } : null}
              onChange={(o: any) => handleChange("department", o?.value || "")}
              isClearable
            />
          </div>
        </div>

        {/* Machine Section */}
        <div className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Machine Details</h2>
          
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Machine Name</label>
            <Select 
              options={toSelectOptions(options.machineNames)} 
              styles={selectStyles}
              placeholder="Select or type..."
              value={form.machineName ? { value: form.machineName, label: form.machineName } : null}
              onChange={(o: any) => handleChange("machineName", o?.value || "")}
              isClearable
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Machine ID</label>
            <Select 
              options={toSelectOptions(options.machineIDs)} 
              styles={selectStyles}
              placeholder="Select ID..."
              value={form.machineId ? { value: form.machineId, label: form.machineId } : null}
              onChange={(o: any) => handleChange("machineId", o?.value || "")}
              isClearable
            />
          </div>
        </div>

        {/* Requirement Section */}
        <div className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Requirement</h2>
          
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Item Name <span className={styles.required}>*</span></label>
            <Select 
              options={toSelectOptions(options.items)} 
              styles={selectStyles}
              placeholder="Search item..."
              value={form.itemName ? { value: form.itemName, label: form.itemName } : null}
              onChange={(o: any) => handleChange("itemName", o?.value || "")}
              isClearable
            />
          </div>

          {form.itemName && (
            <div className={styles.infoBox}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Current Stock</span>
                <span className={styles.stockBadge}>{selectedItemData.stock}</span>
              </div>
            </div>
          )}

          <div className={styles.rowGrid}>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.formLabel}>Require Qty <span className={styles.required}>*</span></label>
              <input 
                type="number" 
                step="any"
                className={styles.formInput} 
                placeholder="0.00" 
                value={form.requireQty}
                onChange={e => handleChange("requireQty", e.target.value)}
              />
            </div>
            
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.formLabel}>Units</label>
              <input 
                type="text" 
                className={styles.formInput} 
                value={selectedItemData.units}
                disabled 
                placeholder="-" 
              />
            </div>
          </div>

        </div>

      </div>

      {/* Sticky Bottom Bar */}
      <div className={styles.bottomBar}>
        <button 
          className={styles.submitBtn} 
          disabled={submitting || !form.personFillingName || !form.itemName || !form.requireQty || !form.department}
          onClick={handleSubmit}
        >
          {submitting ? (
            <>
              <div className={styles.loaderBox} style={{ width: 20, height: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', margin: 0 }}></div>
              Submitting...
            </>
          ) : (
            "Submit Indent"
          )}
        </button>
      </div>

      {/* Success Modal */}
      {successRkd && (
        <div className={styles.successModal}>
          <div className={styles.topBlob}></div>
          <div className={styles.bottomBlob}></div>
          
          <div className={styles.successCard}>
            <div className={styles.successIcon} style={{ background: 'transparent', fontSize: '80px', marginBottom: 0 }}>
              📬
            </div>
            <h3 className={styles.successTitle}>Indent Submitted!!</h3>
            <div className={styles.successSubtitle}>
              Your requirement has been received! One of our team members will be in touch with you shortly.
            </div>
            <div className={styles.successRkd}>{successRkd}</div>
            <button className={styles.successBtn} onClick={() => setSuccessRkd(null)}>Go home</button>
          </div>
        </div>
      )}
    </div>
  );
}
