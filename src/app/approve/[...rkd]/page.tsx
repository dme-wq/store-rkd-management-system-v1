"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, X, Package, User, Hash, IndianRupee, Activity, Loader2 } from "lucide-react";
import styles from "./approve.module.css";

export default function ApprovalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  // Get values from URL query string
  const qty = searchParams.get("qty") || "0";
  const rate = searchParams.get("rate") || "0";
  const vendor = searchParams.get("vendor") || "-";

  // Join catch-all segments back into a single string
  const rkd = Array.isArray(params.rkd) ? params.rkd.join("/") : params.rkd;
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function load() {
      if (!rkd) return;
      try {
        const res = await fetch("/api/sheets");
        const json = await res.json();
        if (json.success) {
          const row = json.data.find((r: any) => String(r["Store RKD Number"]) === String(rkd));
          if (row) setData(row);
          else setError(`Record "${rkd}" not found or already processed.`);
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
  }, [rkd]);

  const handleAction = async (ownerStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "WHATSAPP_UPDATE",
          rkdNumber: rkd,
          ownerStatus,
          approvedQty: qty,
          rate: rate,
          vendor: vendor
        })
      });
      const json = await res.json();
      if (json.success) {
        setDone(true);
      } else {
        setError(`Failed to update status: ${json.error}`);
      }
    } catch (e) {
      setError("Network error. Please check your connection.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loaderBox}>
          <Loader2 className={styles.spin} size={48} />
          <p>Fetching Request Details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>⚠️</div>
          <h2>Error</h2>
          <p>{error || "Record not found."}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✅</div>
          <h2>Action Recorded</h2>
          <p>Your response for RKD #{rkd} has been successfully logged.</p>
          <p className={styles.footerNote}>You can close this window now.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Store Approval</h1>
        <div className={styles.badge}>{data["Status"]}</div>
      </div>

      <div className={styles.card}>
        <div className={styles.infoRow}>
          <div className={styles.iconBox}><Hash size={20} /></div>
          <div className={styles.infoText}>
            <label>RKD Store Number</label>
            <span>{data["Store RKD Number"]}</span>
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
            onClick={() => handleAction("No")}
            disabled={updating}
          >
            {updating ? <Loader2 className={styles.spin} size={20} /> : <X size={20} />}
            Reject
          </button>
          <button 
            className={styles.approveBtn} 
            onClick={() => handleAction("Yes")}
            disabled={updating}
          >
            {updating ? <Loader2 className={styles.spin} size={20} /> : <Check size={20} />}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
