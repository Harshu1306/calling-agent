"use client";
/**
 * Call Detail Page - Shows full call information, AI summary, and transcript.
 */
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCallDetail, formatDuration, formatDate, getLeadStatusStyle, getCallStatusStyle, formatLabel } from "@/lib/api";

export default function CallDetailPage() {
  const params = useParams();
  const callId = Number(params.id);
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCall = async () => {
      try {
        const data = await getCallDetail(callId);
        setCall(data);
      } catch (err) {
        setError("Could not load call details. Is the backend running?");
      } finally {
        setLoading(false);
      }
    };
    fetchCall();
  }, [callId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Loading call details...</p>
        </div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-gray-700 font-medium">{error || "Call not found"}</p>
        <Link href="/calls" className="mt-4 inline-block btn-secondary">← Back to Calls</Link>
      </div>
    );
  }

  const s = call.summary;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">Dashboard</Link>
        <span>/</span>
        <Link href="/calls" className="hover:text-blue-600">Calls</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Call #{callId}</span>
      </div>

      {/* Call Information */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">📋 Call Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Customer</p>
            <p className="font-semibold text-gray-900">{call.customer?.name || "Unknown"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Phone</p>
            <p className="font-semibold text-gray-900">{call.customer?.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Date</p>
            <p className="font-semibold text-gray-900">{formatDate(call.start_time)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Duration</p>
            <p className="font-semibold text-gray-900">{formatDuration(call.duration)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Call Status</p>
            <span className={`badge ${getCallStatusStyle(call.status)}`}>
              {formatLabel(call.status)}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Lead Status</p>
            <span className={`badge ${getLeadStatusStyle(call.lead_status)}`}>
              {formatLabel(call.lead_status)}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outcome</p>
            <p className="font-medium text-gray-700">{formatLabel(call.outcome)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Follow-up</p>
            <p className={`font-medium ${call.follow_up_required ? "text-blue-600" : "text-gray-500"}`}>
              {call.follow_up_required ? "✓ Required" : "Not Required"}
            </p>
          </div>
        </div>
        {call.failure_reason && (
          <div className="mt-4 bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-500 uppercase font-medium mb-1">Failure Reason</p>
            <p className="text-red-700 text-sm">{call.failure_reason}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🤖 AI Summary</h2>
          {s ? (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-blue-900 text-sm leading-relaxed">{s.summary || "No summary generated."}</p>
              </div>
              {s.important_points && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Important Points</p>
                  <p className="text-gray-700 text-sm">{s.important_points}</p>
                </div>
              )}
              {s.follow_up_requirements && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Follow-up Required</p>
                  <p className="text-gray-700 text-sm">{s.follow_up_requirements}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm italic">No summary available. Summary is generated when the call ends.</p>
          )}
        </div>

        {/* Customer Requirements */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">💧 Customer Requirements</h2>
          {s ? (
            <div className="space-y-3">
              {[
                { label: "Requirement", value: s.requirement },
                { label: "Capacity", value: s.capacity ? `${s.capacity}` : null },
                { label: "Location", value: s.location },
                { label: "Application", value: s.application },
                { label: "Budget", value: s.budget ? `₹${Number(s.budget).toLocaleString("en-IN")}` : s.budget },
                { label: "Purchase Timeline", value: s.timeline },
                { label: "Customer Intent", value: formatLabel(s.customer_intent) },
                { label: "Lead Outcome", value: formatLabel(s.outcome) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className="text-sm font-medium text-gray-900">{value || "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm italic">No requirements data. Complete a call to see extracted requirements.</p>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">
          💬 Complete Transcript
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({call.transcripts?.length || 0} messages)
          </span>
        </h2>
        
        {!call.transcripts || call.transcripts.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-8">No transcript available.</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {call.transcripts.map((t: any, i: number) => (
              <div
                key={i}
                className={`flex gap-3 ${t.speaker === "AI" ? "" : "flex-row-reverse"}`}
              >
                <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                  t.speaker === "AI"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {t.speaker === "AI" ? "🤖" : "👤"}
                </div>
                <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                  t.speaker === "AI"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  <p className="text-sm leading-relaxed">{t.message}</p>
                  <p className={`text-xs mt-1.5 ${
                    t.speaker === "AI" ? "text-blue-200" : "text-gray-400"
                  }`}>
                    {t.speaker} · {new Date(t.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
