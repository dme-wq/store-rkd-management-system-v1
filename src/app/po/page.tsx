"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, FileText, Loader2, CheckCircle, ArrowLeft, Plus, Edit, ExternalLink } from "lucide-react";
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
  const DARK  = [30, 41, 59]  as [number,number,number]; // Slate 800
  const LGRAY = [241, 245, 249] as [number,number,number]; // Slate 100
  const PRIMARY = [37, 99, 235] as [number,number,number]; // Blue 600

  // ── Header band ──
  doc.setFillColor(...LGRAY);
  doc.rect(W/2 - 30, 8, 60, 6, "F");
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("PURCHASE ORDER", W/2, 12.5, { align:"center" });

  // Outer border will be drawn at the very end to wrap dynamic height.
  let y = 16;
  const startY = y;

  // ── Company block ──
  doc.setFontSize(15); doc.setFont("helvetica","bold"); doc.setTextColor(...PRIMARY);
  doc.text("M/S RKD Furnishings Pvt Ltd.", 8, y+10);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(80, 80, 80);
  doc.text("Plot No. 238-239, Sector-29, Part-II,\nHUDA, Panipat-132103, Haryana", 8, y+15);
  doc.text("GSTIN/UIN: 06AAKCR0233R1Z1\nMr. Sachin  /  +91 98120 00642", 8, y+23);

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
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("Vendor Details", 8, y+5);
  doc.setLineWidth(0.4); doc.setDrawColor(...PRIMARY); doc.line(8, y+6, 35, y+6); // Underline

  doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(40,40,40);
  doc.text(data.vendorName || "-", 8, y+10);
  doc.setFont("helvetica","normal");
  const addrLines = doc.splitTextToSize(data.vendorAddress || "-", 85);
  doc.text(addrLines, 8, y+14);
  const addrH = addrLines.length * 3.5;
  
  doc.text(`Contact Number: ${data.contactNumber || "-"}`, 8, y+16+addrH);
  doc.text(`GST No: ${data.gstDetails || "-"}`, 8, y+20+addrH);

  const delivY = y + 28 + addrH;
  doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text("Delivery Designation", 8, delivY);
  doc.setLineWidth(0.4); doc.setDrawColor(...PRIMARY); doc.line(8, delivY+1, 45, delivY+1); // Underline
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(40,40,40);
  doc.text("RKD Furnishings Pvt Ltd.\nPlot No. 238-239, Sector-29, Part-II,\nHUDA, Panipat-132103, Haryana", 8, delivY+5);

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

  const colX = 120, colW1 = 35, colW2 = 45;
  let iy = y;
  doc.setDrawColor(200,205,210); doc.setLineWidth(0.2);
  infoRows.forEach(([label, val]) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(colX, iy, colW1, 5, "FD");
    doc.rect(colX+colW1, iy, colW2, 5);
    doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
    doc.text(label, colX+2, iy+3.5);
    doc.setFont("helvetica","normal"); doc.setTextColor(40,40,40);
    doc.text(String(val), colX+colW1+2, iy+3.5);
    iy += 5;
  });

  const sectionBottom = Math.max(delivY + 15, iy);
  y = sectionBottom + 5;

  // ── Description of Goods ──
  doc.setFillColor(...LGRAY); doc.rect(5, y, W-10, 6, "F");
  doc.setDrawColor(200,205,210); doc.rect(5, y, W-10, 6);
  doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(...PRIMARY);
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
    margin: { left: 5, right: 5 },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: 40, lineColor: [200,205,210], lineWidth: 0.2 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold", halign:"center", valign:"middle" },
    columnStyles: {
      0: { halign:"center", cellWidth: 10 },
      2: { halign:"center", cellWidth: 32 },
      3: { halign:"center", cellWidth: 16 },
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

  doc.setFillColor(...LGRAY); doc.rect(5, finalY, W-10, 6, "F");
  doc.setDrawColor(200,205,210); doc.rect(5, finalY, W-10, 6);
  doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(...DARK);
  doc.text(formatCurr(totals.subtotal), W-8, finalY+4, { align:"right" });

  let ty = finalY + 12;
  doc.text("GST Amount", W-45, ty, { align:"right" });
  doc.text(formatCurr(totals.gstAmt), W-8, ty, { align:"right" });
  
  ty += 6;
  doc.text("Total Bill Value", W-45, ty, { align:"right" });
  doc.text(formatCurr(grandTotal), W-8, ty, { align:"right" });
  
  // Red box around Total Bill Value row area
  doc.setDrawColor(220,38,38); doc.setLineWidth(0.4); doc.setFillColor(254,242,242);
  doc.rect(5, ty-4.5, W-10, 6.5, "FD"); 
  doc.setTextColor(220,38,38);
  doc.text("Total Bill Value", W-45, ty, { align:"right" });
  doc.text(formatCurr(grandTotal), W-8, ty, { align:"right" });

  // ── Signature box ──
  const sigY = ty + 15;
  doc.setDrawColor(...PRIMARY); doc.setLineWidth(0.4); doc.setFillColor(244,248,255);
  doc.rect(W-70, sigY, 65, 25, "FD");
  doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(...PRIMARY);
  doc.text("For RKD FURNISHINGS PVT LTD", W-37.5, sigY+6, { align: "center" });
  doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(100,100,100);
  doc.text("Authorized Signatory", W-37.5, sigY+22, { align: "center" });

  // ── Footer ──
  doc.setFontSize(7.5); doc.setFont("helvetica","bold"); doc.setTextColor(150,150,150);
  doc.text("This is a Computer Generated Copy", W/2, sigY+40, { align:"center" });

  // Draw main outer box around everything up to here
  doc.setDrawColor(200,205,210); doc.setLineWidth(0.4);
  doc.rect(5, startY, W-10, sigY+45-startY);

  return doc.output("datauristring").split(",")[1]; // Return base64
}

// ── Types ────────────────────────────────────────────────────
interface POData {
  poNumber: string; poDate: string; vendorName: string; vendorAddress: string;
  paymentTerms: string; termsOfDelivery: string; freightCharges: string; transporterName: string;
  quoteRefNo: string; packingCharges: string; discount: string; expectedArrival: string;
  poCheckedBy: string; pdfUrl: string; poGrandTotal: string; items: any[];
}

// ── Main Component ───────────────────────────────────────────
export default function PurchaseOrderPage() {
  const router = useRouter();

  const [isNavigating, setIsNavigating] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "edit">("list");
  const [poList, setPoList] = useState<POData[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [isEditing, setIsEditing] = useState(false); // true if editing existing PO

  // Data states for edit/create
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
  const [existingPdfUrl,  setExistingPdfUrl]  = useState("");

  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const today = todayStr();

  const fetchPOList = () => {
    setLoadingList(true);
    fetch("/api/po?action=listPOs")
      .then(r => r.json())
      .then(data => { if (data.success) setPoList(data.pos); })
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    fetchPOList();
    fetch("/api/po?action=vendors").then(r => r.json()).then(d => {
      if (d.success) setVendors(d.vendors);
      setLoadingVen(false);
    });
  }, []);

  // ── Load items when vendor selected (in Create mode) ──
  useEffect(() => {
    if (isEditing || !selVendor) return; // If editing, items are pre-populated
    setLoadingItems(true);
    fetch(`/api/po?action=items&vendor=${encodeURIComponent(selVendor.name)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setItems(data.items.map((i: any) => ({ ...i, included: true })));
      }).finally(() => setLoadingItems(false));
  }, [selVendor, isEditing]);

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

  const handleCreateNew = () => {
    setIsNavigating(true);
    setIsEditing(false);
    setSelVendor(null);
    setItems([]);
    setPaymentTerms("After"); setTermsOfDelivery("Ready Stock"); setFreightCharges("Nill");
    setTransporterName("Nill"); setQuoteRefNo("Nill"); setPackingCharges("Nill");
    setDiscount("Nill"); setExpectedArrival(""); setPoCheckedBy("Mr. Sachin"); setExistingPdfUrl("");
    setSuccess(null); setError(null);
    fetch("/api/po?action=nextPO").then(r => r.json()).then(d => { if(d.success) setPoNumber(d.poNumber); });
    setViewMode("edit");
    setTimeout(() => setIsNavigating(false), 300);
  };

  const handleEditPO = (po: POData) => {
    setIsNavigating(true);
    setIsEditing(true);
    setPoNumber(po.poNumber);
    setSelVendor({ name: po.vendorName, address: po.vendorAddress });
    setPaymentTerms(po.paymentTerms);
    setTermsOfDelivery(po.termsOfDelivery);
    setFreightCharges(po.freightCharges);
    setTransporterName(po.transporterName);
    setQuoteRefNo(po.quoteRefNo);
    setPackingCharges(po.packingCharges);
    setDiscount(po.discount);
    setExpectedArrival(po.expectedArrival);
    setPoCheckedBy(po.poCheckedBy);
    setExistingPdfUrl(po.pdfUrl);
    setItems(po.items);
    setSuccess(null); setError(null);
    setViewMode("edit");
    setTimeout(() => setIsNavigating(false), 300);
  };

  const handleSave = async () => {
    if (!selVendor) { setError("Please select a vendor."); return; }
    if (includedItems.length === 0) { setError("Please include at least one item."); return; }
    if (!expectedArrival) { setError("Please provide the Expected Date of Arrival."); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      const pdfBase64 = await generatePDF({
        poNumber, poDate: today,
        vendorName: selVendor.name, vendorAddress: selVendor.address,
        paymentTerms, termsOfDelivery, freightCharges, transporterName,
        quoteRefNo, packingCharges, discount, expectedArrival, poCheckedBy,
        items: includedItems,
      });

      const payload = {
        poNumber, poDate: today,
        vendorName: selVendor.name, vendorAddress: selVendor.address,
        paymentTerms, termsOfDelivery, freightCharges, transporterName,
        quoteRefNo, packingCharges, discount, expectedArrival, poCheckedBy,
        items: includedItems, pdfBase64, existingPdfUrl
      };

      const res = await fetch("/api/po", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Trigger download
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `${poNumber}.pdf`;
      link.click();

      setSuccess(`✅ PO ${json.poNumber} ${isEditing ? 'updated' : 'saved'} successfully!`);
      fetchPOList(); // refresh list in background
      
      // If we just created one, switch to edit mode for it so we don't accidentally create it again
      setIsEditing(true); 
      setExistingPdfUrl(json.pdfUrl);

    } catch (err: any) {
      setError("Failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render List View ────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div className={styles.page}>
        {isNavigating && (
          <div className={styles.navigatingOverlay}>
            <div className={styles.navSpinner}></div>
            <div className={styles.navText}>Please wait...</div>
          </div>
        )}
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={() => { setIsNavigating(true); router.push("/"); }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <div className={styles.topBarTitle}>Purchase Order Management</div>
          <div style={{ width: 150 }}></div>
        </div>

        <div className={styles.contentArea} style={{ marginTop: 24 }}>
          <div className={styles.objectHeader}>
            <div className={styles.objectHeaderLeft}>
              <h1>Manage Purchase Orders</h1>
              <div className={styles.objectHeaderTags}>
                <span>Total POs: {poList.length}</span>
              </div>
            </div>
            <div className={styles.objectHeaderActions}>
              <button className={`${styles.sapBtn} ${styles.sapBtnEmphasized}`} onClick={handleCreateNew}>
                <Plus size={16} /> Create New PO
              </button>
            </div>
          </div>

          <div className={styles.sapCard}>
            <div className={styles.sapCardHeader}>Existing Purchase Orders</div>
            <div className={styles.tableWrap}>
              <table className={styles.sapTable}>
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Date</th>
                    <th>Vendor</th>
                    <th>Items</th>
                    <th className={styles.numCell}>Total Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px" }}><Loader2 className={styles.spin} /> Loading...</td></tr>
                  ) : poList.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>No Purchase Orders found.</td></tr>
                  ) : (
                    poList.map((po) => (
                      <tr key={po.poNumber}>
                        <td style={{ fontWeight: 600 }}>{po.poNumber}</td>
                        <td>{po.poDate}</td>
                        <td>{po.vendorName}</td>
                        <td>{po.items.length}</td>
                        <td className={styles.numCell}>₹{formatCurr(parseFloat(po.poGrandTotal || "0"))}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className={`${styles.sapBtn} ${styles.sapBtnStandard}`} onClick={() => handleEditPO(po)} style={{ padding: '4px 8px' }}>
                              <Edit size={14} /> Edit
                            </button>
                            {po.pdfUrl && (
                              <a href={po.pdfUrl} target="_blank" rel="noreferrer" className={`${styles.sapBtn} ${styles.sapBtnStandard}`} style={{ padding: '4px 8px', textDecoration: 'none' }}>
                                <ExternalLink size={14} /> PDF
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Edit View ────────────────────────────────────────
  return (
    <div className={styles.page}>
      {isNavigating && (
        <div className={styles.navigatingOverlay}>
          <div className={styles.navSpinner}></div>
          <div className={styles.navText}>Please wait...</div>
        </div>
      )}
      <div className={styles.topBar}>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className={styles.backBtn} onClick={() => { setIsNavigating(true); router.push("/"); }}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <button className={styles.backBtn} style={{ background: '#e0e6ed', color: '#1d2d3e' }} onClick={() => { setIsNavigating(true); setViewMode("list"); setTimeout(() => setIsNavigating(false), 300); }}>
            <ArrowLeft size={16} /> Back to PO List
          </button>
        </div>
        <div className={styles.topBarTitle}>New PO: {poNumber}</div>
        <div style={{ width: 150 }}></div>
      </div>

      <div className={styles.contentArea} style={{ marginTop: 24 }}>
        
        {/* Object Header */}
        <div className={styles.objectHeader}>
          <div className={styles.objectHeaderLeft}>
            <h1>{isEditing ? `Edit: ${poNumber}` : `New PO: ${poNumber}`}</h1>
            <div className={styles.objectHeaderTags}>
              <span className={styles.sapBadge}>{isEditing ? "Draft (Editing)" : "New Draft"}</span>
              <span>Date: {today}</span>
            </div>
          </div>
          <div className={styles.objectHeaderActions}>
            <button className={`${styles.sapBtn} ${styles.sapBtnAccept}`} onClick={handleSave} disabled={saving || !selVendor || includedItems.length === 0}>
              {saving ? <Loader2 size={16} className={styles.spin} /> : <FileText size={16} />}
              {saving ? "Saving..." : "Save & Generate PDF"}
            </button>
          </div>
        </div>

        {error   && <div className={styles.alertError}>{error}</div>}
        {success && <div className={styles.alertSuccess}>{success}</div>}

        <div className={styles.formGrid}>
          {/* ── LEFT: Vendor + Items ── */}
          <div className={styles.leftPanel}>
            <div className={styles.sapCard} style={{ position: 'relative', zIndex: 50 }}>
              <div className={styles.sapCardHeader}>Vendor Details</div>
              <div className={styles.sapCardContent}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Select Vendor <span className={styles.required}>*</span></label>
                  {!isEditing ? (
                    <div className={styles.vendorDropWrap}>
                      <div className={`${styles.vendorTrigger} ${vendorOpen ? styles.open : ""}`} onClick={() => setVendorOpen(o => !o)}>
                        <Search size={15} color="#556b82" />
                        {vendorOpen ? (
                          <input autoFocus className={styles.vendorSearchInput} value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} placeholder="Type to search..." onClick={e => e.stopPropagation()} />
                        ) : (
                          <span style={{flex: 1, color: selVendor ? '#1d2d3e' : '#556b82', fontWeight: selVendor ? 600 : 400}}>
                            {selVendor ? selVendor.name : "— Select Vendor —"}
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: '#556b82' }}>▼</span>
                      </div>
                      {vendorOpen && (
                        <div className={styles.vendorList}>
                          {loadingVen ? (
                            <div style={{padding: 16, textAlign: 'center'}}><Loader2 size={16} className={styles.spin} /></div>
                          ) : filteredVendors.map(v => (
                            <div key={v.name} className={styles.vendorOption} onClick={() => { setSelVendor(v); setVendorOpen(false); setVendorSearch(""); }}>
                              <div className={styles.vendorOptName}>{v.name}</div>
                              <div className={styles.vendorOptAddr}>{v.address}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input className={styles.input} value={selVendor?.name || ""} readOnly />
                  )}
                </div>
                {selVendor && (
                  <div style={{ fontSize: '0.875rem', color: '#556b82', marginTop: 8 }}>
                    <strong>Address:</strong> {selVendor.address || "N/A"}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.sapCard} style={{ position: 'relative', zIndex: 10 }}>
              <div className={styles.sapCardHeader}>
                Items for PO
                <span className={styles.sapBadge}>{includedItems.length} selected</span>
              </div>
              <div className={styles.tableWrap}>
                {loadingItems ? (
                   <div style={{padding: 40, textAlign: 'center'}}><Loader2 size={24} className={styles.spin} /></div>
                ) : items.length === 0 ? (
                   <div style={{padding: 40, textAlign: 'center', color: '#556b82'}}>No items found.</div>
                ) : (
                  <table className={styles.sapTable}>
                    <thead>
                      <tr>
                        <th>✓</th>
                        <th>Item Description</th>
                        <th>RKD No</th>
                        <th className={styles.numCell}>Qty</th>
                        <th className={styles.numCell}>Rate</th>
                        <th className={styles.numCell}>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const qty  = parseFloat(item.approvedQty || "0");
                        const rate = parseFloat(item.rate || "0");
                        const total = qty * rate;
                        return (
                          <tr key={idx} className={!item.included ? styles.rowExcluded : ""}>
                            <td>
                              <input type="checkbox" checked={item.included} onChange={() => setItems(prev => prev.map((it,i) => i===idx ? {...it,included:!it.included} : it))} className={styles.checkbox} />
                            </td>
                            <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                            <td style={{ fontSize: '0.75rem', color: '#556b82' }}>{item.rkdNumber}</td>
                            <td className={styles.numCell}>
                              <input type="number" className={styles.input} style={{ width: '60px', padding: '4px', textAlign: 'right' }} value={item.approvedQty} onChange={e => setItems(prev => prev.map((it,i) => i===idx ? {...it, approvedQty: e.target.value} : it))} />
                            </td>
                            <td className={styles.numCell}>
                              <input type="number" className={styles.input} style={{ width: '80px', padding: '4px', textAlign: 'right' }} value={item.rate} onChange={e => setItems(prev => prev.map((it,i) => i===idx ? {...it, rate: e.target.value} : it))} />
                            </td>
                            <td className={styles.numCell}>₹{formatCurr(total)}</td>
                            <td>
                              <button style={{ background: 'transparent', border: 'none', color: '#bb0000', cursor: 'pointer' }} onClick={() => setItems(prev => prev.filter((_,i) => i!==idx))} title="Remove">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style={{textAlign:"right",fontWeight:600}}>Subtotal:</td>
                        <td className={styles.numCell}>₹{formatCurr(totals.subtotal)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={5} style={{textAlign:"right",fontWeight:600}}>GST Amount:</td>
                        <td className={styles.numCell}>₹{formatCurr(totals.gst)}</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td colSpan={5} style={{textAlign:"right",fontWeight:700,fontSize:'1rem'}}>Total Bill Value:</td>
                        <td className={styles.numCell} style={{fontWeight:700,fontSize:'1rem'}}>₹{formatCurr(totals.subtotal+totals.gst)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: PO Details form ── */}
          <div className={styles.rightPanel}>
            <div className={styles.sapCard}>
              <div className={styles.sapCardHeader}>General Information</div>
              <div className={styles.sapCardContent}>
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
                    <input type="text" className={styles.input} value={val} onChange={e => set(e.target.value)} />
                  </div>
                ))}

                <div className={styles.formGroup}>
                  <label className={styles.label}>Expected Date of Arrival <span className={styles.required}>*</span></label>
                  <input type="date" className={styles.input} value={expectedArrival} onChange={e => setExpectedArrival(e.target.value)} />
                </div>

                <div className={styles.deliveryBox}>
                  <div className={styles.deliveryTitle}>Delivery Designation</div>
                  <div className={styles.deliveryAddr}>
                    RKD Furnishings Pvt Ltd.<br />
                    Plot No. 238-239, Sector-29, Part-II<br />
                    HUDA, Panipat-132103, Haryana
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
