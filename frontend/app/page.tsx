"use client";
/**
 * Admin Dashboard - Main page
 * Shows stats, recent calls, and the Start AI Call button.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getDashboardStats, getCalls, formatDuration, formatDate, getLeadStatusStyle, getCallStatusStyle, formatLabel } from "@/lib/api";

// Load VoiceCallModal only on client side (uses browser APIs)
const VoiceCallModal = dynamic(() => import("@/components/VoiceCallModal"), { ssr: false });

interface Stats {
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  interested_leads: number;
  follow_ups_required: number;
  average_duration: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [showCallModal, setShowCallModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsData, callsData] = await Promise.all([
        getDashboardStats(),
        getCalls({ page_size: "5" } as any),
      ]);
      setStats(statsData);
      setRecentCalls(callsData.calls || []);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCallEnded = () => {
    // Refresh stats after call ends
    fetchData();
  };

  const statCards = stats ? [
    { label: "Total Calls", value: stats.total_calls, icon: "📞", color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Completed", value: stats.completed_calls, icon: "✅", color: "text-green-600", bg: "bg-green-50" },
    { label: "Failed", value: stats.failed_calls, icon: "❌", color: "text-red-600", bg: "bg-red-50" },
    { label: "Interested Leads", value: stats.interested_leads, icon: "⭐", color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "Follow-ups", value: stats.follow_ups_required, icon: "🔁", color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Avg Duration", value: formatDuration(stats.average_duration), icon: "⏱️", color: "text-gray-600", bg: "bg-gray-50" },
  ] : [];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">AI-Powered Commercial RO Sales & Lead Qualification</p>
        </div>
        <button
          onClick={() => setShowCallModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
        >
          <span>📞</span>
          Start AI Call
        </button>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="stat-card">
              <div className={`${card.bg} w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-3`}>
                {card.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Calls</h2>
          <Link href="/calls" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            View All →
          </Link>
        </div>
        
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentCalls.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-4xl mb-3">📞</p>
            <p className="text-gray-500 font-medium">No calls yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "Start AI Call" to begin your first call</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Lead Status</th>
                  <th className="table-header">Follow-up</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 transition">
                    <td className="table-cell">
                      <div className="font-medium">{call.customer_name || "Unknown"}</div>
                      <div className="text-xs text-gray-400">{call.customer_phone || "—"}</div>
                    </td>
                    <td className="table-cell text-gray-500 text-xs">{formatDate(call.start_time)}</td>
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
                    <td className="table-cell">
                      {call.follow_up_required ? (
                        <span className="text-blue-600 font-medium text-xs">✓ Required</span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <Link
                        href={`/calls/${call.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
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
      </div>

      {/* Voice Call Modal */}
      {showCallModal && (
        <VoiceCallModal
          onClose={() => setShowCallModal(false)}
          onCallEnded={handleCallEnded}
        />
      )}
    </div>
  );
}
