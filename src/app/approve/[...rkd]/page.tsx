"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, X, Package, User, Hash, IndianRupee, Activity, Loader2 } from "lucide-react";
import styles from "./approve.module.css";

export default function ApprovalPage() {
  const params = useParams();
  
  // Join catch-all segments back into a single string for the initially clicked RKD
  const urlRkd = Array.isArray(params.rkd) ? params.rkd.join("/") : params.rkd;
  
  const [dataList, setDataList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sheets");
        const json = await res.json();
        if (json.success) {
          // Filter for pending approvals:
          // Status === "Requirement Open", Approved Qty > 0, Approval Require? === "Pending"
          let pending = json.data.filter((r: any) => 
            r["Status"] === "Requirement Open" && 
            Number(r["Approved Quantity"] || "0") > 0 &&
            r["Approval Require?"] === "Pending"
          );

          // Sort so the one clicked from WhatsApp is at the very top
          if (urlRkd) {
            pending.sort((a: any, b: any) => {
              if (a["Store RKD Number"] === urlRkd) return -1;
              if (b["Store RKD Number"] === urlRkd) return 1;
              return 0;
            });
          }

          setDataList(pending);
        } else {
          setError("Failed to connect to database.");
        }
      } catch (e) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [urlRkd]);

  const handleAction = async (ownerStatus: string, row: any) => {
    const rkdNumber = row["Store RKD Number"];
    setUpdatingId(rkdNumber);
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "WHATSAPP_UPDATE",
          rkdNumber: rkdNumber,
          ownerStatus,
          approvedQty: row["Approved Quantity"],
          rate: row["Price"] || "0",
          vendor: row["Vendor Name"] || "-"
        })
      });
      const json = await res.json();
      if (json.success) {
        setCompletedIds(prev => new Set(prev).add(rkdNumber));
      } else {
        alert(`Failed to update status: ${json.error}`);
      }
    } catch (e) {
      alert("Network error. Please check your connection.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loaderBox}>
          <Loader2 className={styles.spin} size={48} />
          <p>Fetching Pending Approvals...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>⚠️</div>
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (dataList.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successIcon}>🎉</div>
          <h2>All Caught Up!</h2>
          <p>There are no pending material requests requiring your approval right now.</p>
          <p className={styles.footerNote}>You can safely close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Store Dashboard</h1>
        <div className={styles.badge}>{dataList.length - completedIds.size} Pending</div>
      </div>

      {dataList.map((data, index) => {
        const rkd = data["Store RKD Number"];
        const qty = data["Approved Quantity"];
        const rate = data["Price"] || "0";
        const vendor = data["Vendor Name"] || "-";
        const isCompleted = completedIds.has(rkd);
        const isTarget = rkd === urlRkd;

        if (isCompleted) {
          return (
            <div key={rkd} className={styles.card} style={{ opacity: 0.8, borderLeft: '4px solid #22c55e' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className={styles.successIcon} style={{ fontSize: '1.5rem', marginBottom: 0 }}>✅</div>
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#166534' }}>Processed RKD #{rkd}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#666' }}>Action recorded successfully.</p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={rkd} className={styles.card} style={isTarget ? { border: '2px solid #16a34a', boxShadow: '0 8px 24px rgba(22, 163, 74, 0.15)' } : {}}>
            {isTarget && <div style={{ background: '#16a34a', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', alignSelf: 'flex-start', marginBottom: '12px' }}>Opened from WhatsApp</div>}
            
            <div className={styles.infoRow}>
              <div className={styles.iconBox}><Hash size={20} /></div>
              <div className={styles.infoText}>
                <label>RKD Store Number</label>
                <span>{rkd}</span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.iconBox}><Package size={20} /></div>
              <div className={styles.infoText}>
                <label>Item Name</label>
                <span>{data["Item Name"]}</span>
              </div>
            </div>

            <div className={styles.infoRow}>
              <div className={styles.iconBox}><User size={20} /></div>
              <div className={styles.infoText}>
                <label>Proposed Vendor</label>
                <span>{vendor}</span>
              </div>
            </div>

            <div className={styles.grid}>
              <div className={styles.infoRow}>
                <div className={styles.iconBox}><Activity size={20} /></div>
                <div className={styles.infoText}>
                  <label>Approved Qty</label>
                  <span>{qty} {data["Units"]}</span>
                </div>
              </div>
              <div className={styles.infoRow}>
                <div className={styles.iconBox}><IndianRupee size={20} /></div>
                <div className={styles.infoText}>
                  <label>Rate / Unit</label>
                  <span>Rs. {rate}</span>
                </div>
              </div>
            </div>

            {/* Total Price Highlight */}
            <div style={{
              background: 'linear-gradient(135deg, #166534, #15803d)',
              borderRadius: '16px',
              padding: '16px 20px',
              margin: '12px 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
                <span style={{ fontSize: '1.2rem' }}>🧾</span>
                <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.5px' }}>TOTAL PRICE</span>
              </div>
              <span style={{ 
                fontWeight: 900, 
                fontSize: '1.4rem', 
                color: '#bbf7d0',
                letterSpacing: '0.5px'
              }}>
                Rs. {(parseFloat(qty) * parseFloat(rate || "0")).toFixed(2)}
              </span>
            </div>

            <div className={styles.divider} />

            <div className={styles.actions}>
              <button 
                className={styles.rejectBtn} 
                onClick={() => handleAction("No", data)}
                disabled={updatingId === rkd}
              >
                {updatingId === rkd ? <Loader2 className={styles.spin} size={20} /> : <X size={20} />}
                Reject
              </button>
              <button 
                className={styles.approveBtn} 
                onClick={() => handleAction("Yes", data)}
                disabled={updatingId === rkd}
              >
                {updatingId === rkd ? <Loader2 className={styles.spin} size={20} /> : <Check size={20} />}
                Approve
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
