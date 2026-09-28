const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function startCall(
  customerName?: string,
  customerPhone?: string
) {
  const res = await fetch(`${API_BASE}/calls/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : "Failed to start call"
    );
  }

  return res.json();
}

export async function sendMessage(
  callId: number,
  userMessage: string
) {
  const res = await fetch(
    `${API_BASE}/calls/${callId}/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_message: userMessage,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : "Failed to send message"
    );
  }

  return res.json();
}

export async function endCall(
  callId: number,
  reason = "completed"
) {
  const res = await fetch(
    `${API_BASE}/calls/${callId}/end`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : "Failed to end call"
    );
  }

  return res.json();
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

/**
 * Upload recorded audio to the backend
 * and receive the Whisper transcription.
 */
export async function transcribeAudio(
  audioBlob: Blob
): Promise<TranscriptionResult> {
  const ext = audioBlob.type.includes("webm")
    ? "webm"
    : audioBlob.type.includes("ogg")
    ? "ogg"
    : audioBlob.type.includes("mp4")
    ? "mp4"
    : audioBlob.type.includes("wav")
    ? "wav"
    : "webm";

  const formData = new FormData();

  formData.append(
    "audio",
    audioBlob,
    `speech.${ext}`
  );

  let res: Response;

  try {
    res = await fetch(
      `${API_BASE}/speech/transcribe`,
      {
        method: "POST",
        body: formData,
      }
    );
  } catch {
    throw new Error(
      "Audio upload failed. Check that the backend is running."
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : "Failed to transcribe audio"
    );
  }

  return res.json();
}

export async function getCallAudio(
  callId: number,
  text: string
): Promise<string> {
  const params = new URLSearchParams({
    text,
  });

  const res = await fetch(
    `${API_BASE}/calls/${callId}/audio?${params}`
  );

  if (!res.ok) {
    return "";
  }

  const data = await res.json();

  return data.audio_base64 || "";
}

export async function getCalls(
  filters: Record<
    string,
    string | boolean | undefined
  > = {}
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== ""
      ) {
        params.set(key, String(value));
      }
    }
  );

  const res = await fetch(
    `${API_BASE}/calls?${params}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : "Failed to fetch calls"
    );
  }

  return res.json();
}

export async function getCallDetail(
  callId: number
) {
  const res = await fetch(
    `${API_BASE}/calls/${callId}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : "Failed to fetch call detail"
    );
  }

  return res.json();
}

export async function getDashboardStats() {
  const res = await fetch(
    `${API_BASE}/dashboard/stats`
  );

  if (!res.ok) {
    throw new Error(
      `Failed to fetch stats: ${res.status}`
    );
  }

  return res.json();
}

/** Play base64 MP3 audio in the browser */
export function playAudioBase64(
  base64Audio: string
): Promise<void> {
  return new Promise((resolve) => {
    if (!base64Audio) {
      resolve();
      return;
    }

    const audio = new Audio(
      `data:audio/mp3;base64,${base64Audio}`
    );

    audio.onended = () => resolve();
    audio.onerror = () => resolve();

    audio.play().catch(() => resolve());
  });
}

/** Format duration in seconds to MM:SS */
export function formatDuration(
  seconds: number | null
): string {
  if (!seconds) {
    return "—";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(mins).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}`;
}

/** Format ISO date string to readable format */
export function formatDate(
  dateStr: string | null
): string {
  if (!dateStr) {
    return "—";
  }

  return new Date(dateStr).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/** Get CSS classes for lead status badge */
export function getLeadStatusStyle(
  status: string | null
): string {
  const map: Record<string, string> = {
    interested:
      "bg-green-100 text-green-800",
    not_interested:
      "bg-red-100 text-red-800",
    maybe:
      "bg-yellow-100 text-yellow-800",
    follow_up_required:
      "bg-blue-100 text-blue-800",
    information_needed:
      "bg-gray-100 text-gray-700",
  };

  return (
    map[status || ""] ||
    "bg-gray-100 text-gray-700"
  );
}

/** Get CSS classes for call status badge */
export function getCallStatusStyle(
  status: string | null
): string {
  const map: Record<string, string> = {
    completed:
      "bg-green-100 text-green-800",
    active:
      "bg-blue-100 text-blue-800",
    failed:
      "bg-red-100 text-red-800",
    disconnected:
      "bg-red-100 text-red-800",
    no_answer:
      "bg-yellow-100 text-yellow-800",
    interrupted:
      "bg-yellow-100 text-yellow-800",
    error:
      "bg-red-100 text-red-800",
  };

  return (
    map[status || ""] ||
    "bg-gray-100 text-gray-700"
  );
}

/** Format label from snake_case to Title Case */
export function formatLabel(
  str: string | null
): string {
  if (!str) {
    return "—";
  }

  return str
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (c) => c.toUpperCase()
    );
}