"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, FileText, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import styles from "./po.module.css";

// ── Types ────────────────────────────────────────────────────
interface Vendor  { 
  name: string; 
  address: string; 
  contactPerson?: string; 
  contactNumber?: string; 
  gstDetails?: string; 
}
interface POItem  {
  rkdNumber: string; itemName: string; units: string;
  approvedQty: string; rate: string; gst: string;
  included: boolean;
}

// ── Helpers ──────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

const formatCurr = (num: number) => num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RkdLogo = ({ width = 50, height = 55 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
    <path d="M 10 45 L 10 10 L 90 10 L 90 85 L 10 85" fill="none" stroke="#0f172a" strokeWidth="6" />
    <text x="50" y="70" fontFamily="Arial, sans-serif" fontSize="45" fontWeight="bold" textAnchor="middle" fill="#0f172a">RKD</text>
    <text x="50" y="105" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#0f172a">GROUP</text>
  </svg>
);

async function generatePDF(data: any): Promise<string> {
  // Dynamic import to avoid SSR issues
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // ── Colors ──
  const DARK  = [0, 0, 0]  as [number,number,number];
  const LGRAY = [230, 230, 230] as [number,number,number];

  // ── Header band ──
  doc.setFillColor(...LGRAY);
  doc.rect(W/2 - 25, 8, 50, 6, "F");
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("PURCHASE ORDER", W/2, 12.5, { align:"center" });

  // Outer border will be drawn at the very end to wrap dynamic height.
  let y = 16;
  const startY = y;

  // ── Company block ──
  doc.setFontSize(14); doc.setFont("helvetica","bold");
  doc.text("M/S RKD Furnishings Pvt Ltd.", 14, y+10);
  doc.setFontSize(7.5); doc.setFont("helvetica","normal");
  doc.text("Plot No. 238-239, Sector-29, Part-II,\nHUDA, Panipat-132103, Haryana", 14, y+15);
  doc.text("GSTIN/UIN: 06AAKCR0233R1Z1\nMr. Sachin  /  +91 98120 00642", 14, y+23);

  // ── RKD Logo box (Geometric drawing matching the image) ──
  doc.setDrawColor(0,0,0); doc.setLineWidth(1.2);
  doc.line(W-38, y+3, W-38, y+15); // Left vertical top-half
  doc.line(W-38, y+3, W-18, y+3);  // Top horizontal
  doc.line(W-18, y+3, W-18, y+27); // Right vertical full
  doc.line(W-38, y+27, W-18, y+27);// Bottom horizontal
  doc.setFontSize(22); doc.setFont("helvetica","bold"); doc.setTextColor(0,0,0);
  doc.text("RKD", W-28, y+23, { align:"center" });
  doc.setFontSize(9);
  doc.text("GROUP", W-28, y+31, { align:"center" });

  y += 35; // move below header

  // ── Vendor + PO info split ──
  // Left side: Vendor Details
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(0);
  doc.text("Vendor Details", 14, y+5);
  doc.setLineWidth(0.3); doc.line(14, y+6, 40, y+6); // Underline

  doc.setFontSize(8); doc.setFont("helvetica","bold");
  doc.text(data.vendorName || "-", 14, y+10);
  doc.setFont("helvetica","normal");
  const addrLines = doc.splitTextToSize(data.vendorAddress || "-", 80);
  doc.text(addrLines, 14, y+14);
  const addrH = addrLines.length * 3.5;
  
  doc.text(`Contact Number-${data.contactNumber || "-"}`, 14, y+16+addrH);
  doc.text(`GST No-- ${data.gstDetails || "-"}`, 14, y+20+addrH);

  const delivY = y + 28 + addrH;
  doc.setFontSize(10); doc.setFont("helvetica","bold");
  doc.text("Delivery Designation", 14, delivY);
  doc.line(14, delivY+1, 48, delivY+1); // Underline
  doc.setFontSize(8); doc.setFont("helvetica","normal");
  doc.text("RKD Furnishings Pvt Ltd.\nPlot No. 238-239, Sector-29, Part-II,\nHUDA, Panipat-132103, Haryana", 14, delivY+5);

  // Right side: PO Details table
  const infoRows = [
    ["Purchase Order No",    data.poNumber],
    ["Purchase Order Date",  data.poDate],
    ["Payment Terms",        data.paymentTerms  || "—"],
    ["Terms of Delivery",    data.termsOfDelivery || "—"],
    ["Freight Charges",      data.freightCharges  || "Nill"],
    ["Transporter Name",     data.transporterName || "Nill"],
    ["Quote Ref. No",        data.quoteRefNo      || "Nill"],
    ["Packing Charges",      data.packingCharges  || "Nill"],
    ["Discount",             data.discount        || "Nill"],
    ["Expected Date of Arrival", data.expectedArrival || "—"],
    ["PO Checked by",        data.poCheckedBy     || "—"],
  ];

  const colX = 115, colW1 = 35, colW2 = 45;
  let iy = y;
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.2);
  infoRows.forEach(([label, val]) => {
    doc.rect(colX, iy, colW1, 5);
    doc.rect(colX+colW1, iy, colW2, 5);
    doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(0);
    doc.text(label, colX+2, iy+3.5);
    doc.setFont("helvetica","normal");
    doc.text(String(val), colX+colW1+2, iy+3.5);
    iy += 5;
  });

  const sectionBottom = Math.max(delivY + 15, iy);
  y = sectionBottom + 5;

  // ── Description of Goods ──
  doc.setFillColor(...LGRAY); doc.rect(10, y, W-20, 6, "F");
  doc.setDrawColor(180,180,180); doc.rect(10, y, W-20, 6);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(0);
  doc.text("Description of Goods", W/2, y+4, { align:"center" });
  y += 6;

  const tableBody = data.items.map((item: any, idx: number) => {
    const qty   = parseFloat(item.approvedQty || "0");
    const rate  = parseFloat(item.rate        || "0");
    const gstPc = parseFloat(item.gst         || "0");
    const total = qty * rate; // without gst per screenshot
    return [
      String(idx+1),
      item.itemName,
      item.rkdNumber,
      qty.toFixed(2),
      item.units,
      formatCurr(rate),
      `${gstPc}%`,
      formatCurr(total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["S.No","Item Description","Request No","Quantity","Units","Rate","GST%","Total Amount Rs"]],
    body: tableBody,
    margin: { left: 10, right: 10 },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: 0, lineColor: [180,180,180], lineWidth: 0.2 },
    headStyles: { fillColor: [100,100,100], textColor: 255, fontStyle: "bold", halign:"center", valign:"middle" },
    columnStyles: {
      0: { halign:"center", cellWidth: 10 },
      2: { halign:"center", cellWidth: 30 },
      3: { halign:"center", cellWidth: 14 },
      4: { halign:"center", cellWidth: 12 },
      5: { halign:"right",  cellWidth: 18 },
      6: { halign:"center", cellWidth: 12 },
      7: { halign:"right",  cellWidth: 26 },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY;

  // ── Totals ──
  const totals = data.items.reduce((acc: any, item: any) => {
    const qty   = parseFloat(item.approvedQty || "0");
    const rate  = parseFloat(item.rate        || "0");
    const gstPc = parseFloat(item.gst         || "0");
    const total = qty * rate;
    acc.subtotal += total;
    acc.gstAmt   += total * gstPc / 100;
    return acc;
  }, { subtotal: 0, gstAmt: 0 });
  const grandTotal = totals.subtotal + totals.gstAmt;

  doc.setFillColor(...LGRAY); doc.rect(10, finalY, W-20, 6, "F");
  doc.setDrawColor(180,180,180); doc.rect(10, finalY, W-20, 6);
  doc.setFontSize(8); doc.setFont("helvetica","bold");
  doc.text(formatCurr(totals.subtotal), W-12, finalY+4, { align:"right" });

  let ty = finalY + 12;
  doc.text("GST Amount", W-50, ty, { align:"right" });
  doc.text(formatCurr(totals.gstAmt), W-12, ty, { align:"right" });
  
  ty += 6;
  doc.text("Total Bill Value", W-50, ty, { align:"right" });
  doc.text(formatCurr(grandTotal), W-12, ty, { align:"right" });
  
  // Red box around Total Bill Value row area
  doc.setDrawColor(220,50,50); doc.setLineWidth(0.4);
  doc.rect(10, ty-4.5, W-20, 6.5); 

  // ── Signature box ──
  const sigY = ty + 10;
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.5);
  doc.rect(W-70, sigY, 60, 25);
  doc.setFontSize(6.5); doc.setFont("helvetica","bold");
  doc.text("For RKD FURNISHINGS PVT LTD", W-68, sigY+4);

  // ── Footer ──
  doc.setFontSize(7.5); doc.setFont("helvetica","bold");
  doc.text("This is a Computer Generated Copy", W/2, sigY+40, { align:"center" });

  // Draw main outer box around everything up to here
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.3);
  doc.rect(10, startY, W-20, sigY+45-startY);

  return doc.output("datauristring").split(",")[1]; // Return base64
}

// ── Main Component ───────────────────────────────────────────
export default function PurchaseOrderPage() {
  const router = useRouter();

  // Data states
  const [vendors,     setVendors]     = useState<Vendor[]>([]);
  const [loadingVen,  setLoadingVen]  = useState(true);
  const [selVendor,   setSelVendor]   = useState<Vendor | null>(null);
  const [items,       setItems]       = useState<POItem[]>([]);
  const [loadingItems,setLoadingItems]= useState(false);
  const [poNumber,    setPoNumber]    = useState("...");
  const [vendorSearch,setVendorSearch]= useState("");
  const [vendorOpen,  setVendorOpen]  = useState(false);

  // PO fields
  const [paymentTerms,    setPaymentTerms]    = useState("After");
  const [termsOfDelivery, setTermsOfDelivery] = useState("Ready Stock");
  const [freightCharges,  setFreightCharges]  = useState("Nill");
  const [transporterName, setTransporterName] = useState("Nill");
  const [quoteRefNo,      setQuoteRefNo]      = useState("Nill");
  const [packingCharges,  setPackingCharges]  = useState("Nill");
  const [discount,        setDiscount]        = useState("Nill");
  const [expectedArrival, setExpectedArrival] = useState("");
  const [poCheckedBy,     setPoCheckedBy]     = useState("Mr. Sachin");

  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const today = todayStr();

  // ── Load vendors & PO number on mount ──
  useEffect(() => {
    Promise.all([
      fetch("/api/po?action=vendors").then(r => r.json()),
      fetch("/api/po?action=nextPO").then(r => r.json()),
    ]).then(([vRes, pRes]) => {
      if (vRes.success) setVendors(vRes.vendors);
      if (pRes.success) setPoNumber(pRes.poNumber);
    }).finally(() => setLoadingVen(false));
  }, []);

  // ── Load items when vendor selected ──
  useEffect(() => {
    if (!selVendor) { setItems([]); return; }
    setLoadingItems(true);
    fetch(`/api/po?action=items&vendor=${encodeURIComponent(selVendor.name)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setItems(data.items.map((i: any) => ({ ...i, included: true })));
        }
      }).finally(() => setLoadingItems(false));
  }, [selVendor]);

  const filteredVendors = useMemo(() =>
    vendors.filter(v => v.name.toLowerCase().includes(vendorSearch.toLowerCase())),
    [vendors, vendorSearch]);

  const includedItems = items.filter(i => i.included);

  const totals = useMemo(() => {
    return includedItems.reduce((acc, item) => {
      const qty   = parseFloat(item.approvedQty || "0");
      const rate  = parseFloat(item.rate || "0");
      const gstPc = parseFloat(item.gst  || "0");
      const total = qty * rate;
      acc.subtotal += total;
      acc.gst      += total * gstPc / 100;
      return acc;
    }, { subtotal: 0, gst: 0 });
  }, [includedItems]);

  // ── Submit ──
  const handleSave = async () => {
    if (!selVendor) { setError("Please select a vendor."); return; }
    if (includedItems.length === 0) { setError("Please include at least one item."); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      // Generate PDF
      const pdfBase64 = await generatePDF({
        poNumber, poDate: today,
        vendorName: selVendor.name, vendorAddress: selVendor.address,
        paymentTerms, termsOfDelivery, freightCharges, transporterName,
        quoteRefNo, packingCharges, discount, expectedArrival, poCheckedBy,
        items: includedItems,
      });

      const res = await fetch("/api/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poNumber, poDate: today,
          vendorName: selVendor.name, vendorAddress: selVendor.address,
          paymentTerms, termsOfDelivery, freightCharges, transporterName,
          quoteRefNo, packingCharges, discount, expectedArrival, poCheckedBy,
          items: includedItems, pdfBase64,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Also trigger browser PDF download
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      // Re-use the same generation logic via a lightweight approach:
      const base64 = pdfBase64;
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${base64}`;
      link.download = `${poNumber}.pdf`;
      link.click();

      if (json.driveWarning) {
        setSuccess(`⚠️ PO ${json.poNumber} saved to sheet, BUT Drive upload failed: ${json.driveWarning}`);
      } else {
        setSuccess(`✅ PO ${json.poNumber} saved! PDF downloaded & uploaded to Drive.`);
      }
      
      // Refresh PO number for next use
      fetch("/api/po?action=nextPO").then(r => r.json()).then(d => { if(d.success) setPoNumber(d.poNumber); });
    } catch (err: any) {
      setError("Failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={18} /> Dashboard
        </button>
        <div className={styles.topBarLogo}>
          <RkdLogo width={35} height={40} />
          <div className={styles.topBarTitle}>
            <span>Purchase Order Entry</span>
          </div>
        </div>
        <div className={styles.poNumBadge}>
          <span className={styles.poNumLabel}>PO Number</span>
          <span className={styles.poNumVal}>{poNumber}</span>
          <span className={styles.poDateBadge}>{today}</span>
        </div>
      </div>

      <div className={styles.formGrid}>
        {/* ── LEFT: Vendor + Items ── */}
        <div className={styles.leftPanel}>
          {/* Vendor Selection */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>🏭 Vendor Details</div>

            {/* Searchable Vendor Dropdown */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Select Vendor <span className={styles.required}>*</span></label>
              <div className={styles.vendorDropWrap}>
                <div
                  className={`${styles.vendorTrigger} ${vendorOpen ? styles.open : ""}`}
                  onClick={() => setVendorOpen(o => !o)}
                >
                  <Search size={15} color="#94a3b8" />
                  {vendorOpen ? (
                    <input
                      autoFocus
                      className={styles.vendorSearchInput}
                      value={vendorSearch}
                      onChange={e => setVendorSearch(e.target.value)}
                      placeholder="Type to search vendor..."
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className={selVendor ? styles.vendorSelected : styles.vendorPlaceholder}>
                      {selVendor ? selVendor.name : "— Select Vendor —"}
                    </span>
                  )}
                  <span className={styles.dropArrow}>▼</span>
                </div>

                {vendorOpen && (
                  <div className={styles.vendorList}>
                    {loadingVen ? (
                      <div className={styles.vendorLoading}><Loader2 size={16} className={styles.spin} /> Loading...</div>
                    ) : filteredVendors.length === 0 ? (
                      <div className={styles.vendorEmpty}>No vendors with pending PO</div>
                    ) : filteredVendors.map(v => (
                      <div
                        key={v.name}
                        className={`${styles.vendorOption} ${selVendor?.name === v.name ? styles.vendorOptionActive : ""}`}
                        onClick={() => { setSelVendor(v); setVendorOpen(false); setVendorSearch(""); }}
                      >
                        <div className={styles.vendorOptName}>{v.name}</div>
                        <div className={styles.vendorOptAddr}>{v.address}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selVendor && (
              <div className={styles.vendorInfoBox}>
                <div className={styles.vendorInfoRow}><span>📍</span><span>{selVendor.address || "Address not available"}</span></div>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>📦 Items for PO
              {items.length > 0 && (
                <span className={styles.itemCount}>{includedItems.length}/{items.length} selected</span>
              )}
            </div>

            {loadingItems ? (
              <div className={styles.loadingItems}><Loader2 size={24} className={styles.spin} /><p>Loading items...</p></div>
            ) : items.length === 0 && selVendor ? (
              <div className={styles.emptyItems}>No pending PO items for this vendor</div>
            ) : items.length === 0 ? (
              <div className={styles.emptyItems}>Select a vendor to load items</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.itemTable}>
                  <thead>
                    <tr>
                      <th>✓</th>
                      <th>Item Name</th>
                      <th>RKD No</th>
                      <th>Qty</th>
                      <th>Units</th>
                      <th>Rate</th>
                      <th>GST%</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const qty  = parseFloat(item.approvedQty || "0");
                      const rate = parseFloat(item.rate || "0");
                      const gst  = parseFloat(item.gst  || "0");
                      const total = qty * rate;
                      return (
                        <tr key={idx} className={!item.included ? styles.rowExcluded : ""}>
                          <td>
                            <input
                              type="checkbox"
                              checked={item.included}
                              onChange={() => setItems(prev => prev.map((it,i) => i===idx ? {...it,included:!it.included} : it))}
                              className={styles.checkbox}
                            />
                          </td>
                          <td className={styles.itemName}>{item.itemName}</td>
                          <td className={styles.rkdCell}>{item.rkdNumber}</td>
                          <td className={styles.numCell}>{item.approvedQty}</td>
                          <td>{item.units}</td>
                          <td className={styles.numCell}>₹{formatCurr(rate)}</td>
                          <td className={styles.numCell}>{gst}%</td>
                          <td className={styles.numCell}>₹{formatCurr(total)}</td>
                          <td>
                            <button
                              className={styles.removeBtn}
                              onClick={() => setItems(prev => prev.filter((_,i) => i!==idx))}
                              title="Remove from PO"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={styles.totalRow}>
                      <td colSpan={7} style={{textAlign:"right",fontWeight:700}}>Subtotal:</td>
                      <td className={styles.numCell}>₹{formatCurr(totals.subtotal)}</td>
                      <td></td>
                    </tr>
                    <tr className={styles.totalRow}>
                      <td colSpan={7} style={{textAlign:"right",fontWeight:700}}>GST Amount:</td>
                      <td className={styles.numCell}>₹{formatCurr(totals.gst)}</td>
                      <td></td>
                    </tr>
                    <tr className={styles.grandRow}>
                      <td colSpan={7} style={{textAlign:"right",fontWeight:800}}>Total Bill Value:</td>
                      <td className={styles.numCell}>₹{formatCurr(totals.subtotal+totals.gst)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: PO Details form ── */}
        <div className={styles.rightPanel}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>📋 Purchase Order Details</div>

            {[
              { label:"Payment Terms",         val:paymentTerms,    set:setPaymentTerms },
              { label:"Terms of Delivery",     val:termsOfDelivery, set:setTermsOfDelivery },
              { label:"Freight Charges",       val:freightCharges,  set:setFreightCharges },
              { label:"Transporter Name",      val:transporterName, set:setTransporterName },
              { label:"Quote Ref. No",         val:quoteRefNo,      set:setQuoteRefNo },
              { label:"Packing Charges",       val:packingCharges,  set:setPackingCharges },
              { label:"Discount",              val:discount,        set:setDiscount },
              { label:"PO Checked By",         val:poCheckedBy,     set:setPoCheckedBy },
            ].map(({ label, val, set }) => (
              <div className={styles.formGroup} key={label}>
                <label className={styles.label}>{label}</label>
                <input
                  type="text"
                  className={styles.input}
                  value={val}
                  onChange={e => set(e.target.value)}
                  placeholder={label}
                />
              </div>
            ))}

            <div className={styles.formGroup}>
              <label className={styles.label}>Expected Date of Arrival</label>
              <input
                type="date"
                className={styles.input}
                value={expectedArrival}
                onChange={e => setExpectedArrival(e.target.value)}
              />
            </div>

            {/* Delivery Designation (read-only) */}
            <div className={styles.deliveryBox}>
              <div className={styles.deliveryTitle}>📦 Delivery Designation</div>
              <div className={styles.deliveryAddr}>
                RKD Furnishings Pvt Ltd.<br />
                Plot No. 238-239, Sector-29, Part-II<br />
                HUDA, Panipat-132103, Haryana
              </div>
            </div>
          </div>

          {/* Submit Button */}
          {error   && <div className={styles.alertError}>{error}</div>}
          {success && <div className={styles.alertSuccess}>{success}</div>}

          <button
            className={styles.generateBtn}
            onClick={handleSave}
            disabled={saving || !selVendor || includedItems.length === 0}
          >
            {saving
              ? <><Loader2 size={20} className={styles.spin} /> Generating...</>
              : <><FileText size={20} /> Generate & Save PO</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
