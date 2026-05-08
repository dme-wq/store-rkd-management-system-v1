"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, FileText, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import styles from "./po.module.css";

// ── Types ────────────────────────────────────────────────────
interface Vendor  { name: string; address: string; }
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

async function generatePDF(data: any): Promise<string> {
  // Dynamic import to avoid SSR issues
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // ── Colors ──
  const DARK  = [30, 30, 30]  as [number,number,number];
  const GREEN = [22, 101, 52]  as [number,number,number];
  const LGRAY = [245, 245, 245] as [number,number,number];
  const YGOLD = [255, 214, 100] as [number,number,number];

  // ── Header band ──
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 10, "F");
  doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
  doc.text("PURCHASE ORDER", W/2, 7, { align:"center" });

  // ── Company block ──
  doc.setTextColor(...DARK);
  doc.setFontSize(13); doc.setFont("helvetica","bold");
  doc.text("M/S RKD Furnishings Pvt Ltd.", 14, 20);
  doc.setFontSize(8.5); doc.setFont("helvetica","normal");
  doc.setTextColor(0, 100, 60);
  doc.text("Plot No. 238-239, Sector-29, Part-II, HUDA, Panipat-132103, Haryana", 14, 26);
  doc.text("GSTIN/UIN: 06AAKCR0233R1Z1", 14, 31);
  doc.text("Mr. Sachin  /  +91 98120 00642", 14, 36);

  // ── RKD Logo box ──
  doc.setDrawColor(...GREEN); doc.setLineWidth(1.2);
  doc.rect(W-38, 13, 26, 24);
  doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.setTextColor(...GREEN);
  doc.text("RKD", W-25, 24, { align:"center" });
  doc.setFontSize(7.5); doc.setFont("helvetica","bold");
  doc.text("GROUP", W-25, 30, { align:"center" });

  let y = 42;

  // ── Vendor + PO info two-column table ──
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
    ["PO Checked By",        data.poCheckedBy     || "—"],
  ];

  // Left: Vendor Details
  doc.setFillColor(...LGRAY); doc.rect(10, y, 90, 7, "F");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("Vendor Details", 14, y+5);

  // Right: PO details
  const colX = 105, colW1 = 55, colW2 = 40;
  let iy = y;
  infoRows.forEach(([label, val], idx) => {
    const bg = idx % 2 === 0 ? [255,255,220] as [number,number,number] : [255,255,255] as [number,number,number];
    doc.setFillColor(...bg);
    doc.rect(colX, iy, colW1+colW2, 7, "F");
    doc.setDrawColor(200,200,200); doc.setLineWidth(0.2);
    doc.rect(colX, iy, colW1+colW2, 7);
    doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
    doc.text(label, colX+2, iy+5);
    doc.setFont("helvetica","normal");
    doc.text(String(val), colX+colW1+1, iy+5);
    iy += 7;
  });

  // Vendor name/address in left box
  const vendorBoxH = Math.max(iy - y, 30);
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
  doc.rect(10, y+7, 90, vendorBoxH-7);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...GREEN);
  doc.text(data.vendorName, 14, y+13);
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...DARK);
  const addrLines = doc.splitTextToSize(data.vendorAddress || "", 82);
  doc.text(addrLines, 14, y+19);

  y = Math.max(iy, y + vendorBoxH) + 4;

  // ── Delivery Designation ──
  doc.setFillColor(...LGRAY); doc.rect(10, y, W-20, 7, "F");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("Delivery Designation", 14, y+5);
  y += 7;
  doc.setFont("helvetica","normal"); doc.setFontSize(8);
  const CONSIGNEE = "RKD Furnishings Pvt Ltd.  |  Plot No. 238-239, Sector-29, Part-II, HUDA, Panipat-132103, Haryana";
  doc.text(CONSIGNEE, 14, y+5);
  y += 10;

  // ── Description of Goods ──
  doc.setFillColor(...GREEN); doc.rect(10, y, W-20, 7, "F");
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(255,255,255);
  doc.text("Description of Goods", W/2, y+5, { align:"center" });
  y += 7;

  const tableBody = data.items.map((item: any, idx: number) => {
    const qty   = parseFloat(item.approvedQty || "0");
    const rate  = parseFloat(item.rate        || "0");
    const gstPc = parseFloat(item.gst         || "0");
    const total = qty * rate;
    return [
      String(idx+1),
      item.itemName,
      item.rkdNumber,
      String(qty),
      item.units,
      `₹${rate.toFixed(2)}`,
      `${gstPc}%`,
      `₹${total.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["S.No","Item Description","Request No","Qty","Units","Rate","GST%","Total Amt Rs"]],
    body: tableBody,
    margin: { left: 10, right: 10 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [50,50,50], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250,250,250] },
    columnStyles: {
      0: { halign:"center", cellWidth: 10 },
      2: { cellWidth: 30 },
      3: { halign:"center", cellWidth: 15 },
      4: { halign:"center", cellWidth: 15 },
      5: { halign:"right",  cellWidth: 22 },
      6: { halign:"center", cellWidth: 16 },
      7: { halign:"right",  cellWidth: 24 },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 5;

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

  doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(...DARK);
  doc.text("GST Amount", W-70, finalY+5); doc.setFont("helvetica","bold");
  doc.text(`₹${totals.gstAmt.toFixed(2)}`, W-12, finalY+5, { align:"right" });
  doc.setFontSize(10);
  doc.text("Total Bill Value", W-70, finalY+13); doc.setFont("helvetica","bold");
  doc.text(`₹${grandTotal.toFixed(2)}`, W-12, finalY+13, { align:"right" });

  doc.setDrawColor(...GREEN); doc.setLineWidth(0.5);
  doc.line(10, finalY+17, W-10, finalY+17);

  // ── Signature box ──
  const sigY = finalY + 20;
  doc.setDrawColor(100,100,100); doc.setLineWidth(0.5);
  doc.rect(W-75, sigY, 65, 25);
  doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("For RKD FURNISHINGS PVT LTD", W-72, sigY+5);
  doc.setFontSize(7); doc.setFont("helvetica","normal");
  doc.text("Authorised Signatory", W-72, sigY+22);

  // ── Footer ──
  doc.setFontSize(8); doc.setFont("helvetica","italic"); doc.setTextColor(120,120,120);
  doc.text("This is a Computer Generated Copy", W/2, sigY+35, { align:"center" });

  // Footer band
  const pH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...GREEN); doc.rect(0, pH-8, W, 8, "F");
  doc.setFontSize(7); doc.setTextColor(255,255,255); doc.setFont("helvetica","normal");
  doc.text("RKD Industries | Store Management System", W/2, pH-3, { align:"center" });

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

      setSuccess(`✅ PO ${json.poNumber} saved! PDF downloaded & uploaded to Drive.`);
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
        <div className={styles.topBarTitle}>
          <FileText size={22} />
          <span>Purchase Order Entry</span>
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
                          <td className={styles.numCell}>₹{rate.toFixed(2)}</td>
                          <td className={styles.numCell}>{gst}%</td>
                          <td className={styles.numCell}>₹{total.toFixed(2)}</td>
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
                      <td className={styles.numCell}>₹{totals.subtotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                    <tr className={styles.totalRow}>
                      <td colSpan={7} style={{textAlign:"right",fontWeight:700}}>GST Amount:</td>
                      <td className={styles.numCell}>₹{totals.gst.toFixed(2)}</td>
                      <td></td>
                    </tr>
                    <tr className={styles.grandRow}>
                      <td colSpan={7} style={{textAlign:"right",fontWeight:800}}>Total Bill Value:</td>
                      <td className={styles.numCell}>₹{(totals.subtotal+totals.gst).toFixed(2)}</td>
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
