"use client";
/**
 * Calls List Page - Shows all calls with search and filtering.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCalls, formatDuration, formatDate, getLeadStatusStyle, getCallStatusStyle, formatLabel } from "@/lib/api";

const CALL_STATUSES = ["", "active", "completed", "failed", "disconnected", "no_answer", "interrupted", "error"];
const LEAD_STATUSES = ["", "interested", "not_interested", "maybe", "follow_up_required", "information_needed"];
const OUTCOMES = ["", "sale_prospect", "not_interested", "callback_scheduled", "information_sent", "no_outcome"];

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [customerName, setCustomerName] = useState("");
  const [status, setStatus] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const filters: Record<string, string> = { page: String(page), page_size: "20" };
      if (customerName) filters.customer_name = customerName;
      if (status) filters.status = status;
      if (leadStatus) filters.lead_status = leadStatus;
      if (followUp) filters.follow_up = followUp;
      if (outcome) filters.outcome = outcome;
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;

      const data = await getCalls(filters);
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch calls:", err);
    } finally {
      setLoading(false);
    }
  }, [page, customerName, status, leadStatus, followUp, outcome, dateFrom, dateTo]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCalls();
  };

  const handleReset = () => {
    setCustomerName("");
    setStatus("");
    setLeadStatus("");
    setFollowUp("");
    setOutcome("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Calls</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total calls</p>
        </div>
        <Link href="/" className="btn-secondary">
          ← Dashboard
        </Link>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Filter Calls</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Search by name..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Call Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CALL_STATUSES.map(s => (
                <option key={s} value={s}>{s ? formatLabel(s) : "All Statuses"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Lead Status</label>
            <select
              value={leadStatus}
              onChange={e => setLeadStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LEAD_STATUSES.map(s => (
                <option key={s} value={s}>{s ? formatLabel(s) : "All Lead Statuses"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Follow-up</label>
            <select
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="true">Required</option>
              <option value="false">Not Required</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Outcome</label>
            <select
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {OUTCOMES.map(o => (
                <option key={o} value={o}>{o ? formatLabel(o) : "All Outcomes"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary flex-1">Search</button>
            <button type="button" onClick={handleReset} className="btn-secondary">Reset</button>
          </div>
        </div>
      </form>

      {/* Calls Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading calls...</div>
        ) : calls.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500">No calls found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Date & Time</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Lead Status</th>
                  <th className="table-header">Outcome</th>
                  <th className="table-header">Follow-up</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 transition">
                    <td className="table-cell font-medium">{call.customer_name || "Unknown"}</td>
                    <td className="table-cell text-gray-500">{call.customer_phone || "—"}</td>
                    <td className="table-cell text-xs text-gray-500">{formatDate(call.start_time)}</td>
                    <td className="table-cell">{formatDuration(call.duration)}</td>
                    <td className="table-cell">
                      <span className={`badge ${getCallStatusStyle(call.status)}`}>
                        {formatLabel(call.status)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${getLeadStatusStyle(call.lead_status)}`}>
                        {formatLabel(call.lead_status)}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-gray-500">{formatLabel(call.outcome)}</td>
                    <td className="table-cell">
                      {call.follow_up_required ? (
                        <span className="text-blue-600 font-medium text-xs">✓ Yes</span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <Link
                        href={`/calls/${call.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} calls)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
