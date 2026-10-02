"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { startCall, sendMessage, endCall, getCallAudio, transcribeAudio, getCallDetail } from "@/lib/api";

interface TranscriptLine {
  speaker: "AI" | "Customer";
  message: string;
  timestamp: Date;
}

interface VoiceCallModalProps {
  onClose: () => void;
  onCallEnded: () => void;
}

type CallPhase = "idle" | "starting" | "greeting" | "listening" | "processing" | "speaking" | "ended";

/** A single in-progress microphone capture, with a way to cancel it early. */
interface Capture {
  promise: Promise<Blob | null>;
  cancel: () => void;
}

interface CaptureOptions {
  /** How long to wait for the customer to start speaking before giving up. */
  waitForSpeechMs: number;
  /** How long a continuous silence must last (after speech started) to stop. */
  silenceAfterSpeechMs: number;
  /** Hard cap on total recording length, regardless of speech/silence. */
  maxDurationMs: number;
  /** Skip the "wait for speech to start" phase - assume speech is already happening. */
  skipWaitForSpeech?: boolean;
}

// Candidate MediaRecorder MIME types, in order of preference.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== "undefined"
  );
}

// Simple volume threshold (RMS of the time-domain waveform, roughly 0-1)
// used to detect "the customer is speaking" vs. silence/background noise.
const SPEECH_VOLUME_THRESHOLD = 0.015;
const LEVEL_POLL_INTERVAL_MS = 100;

export default function VoiceCallModal({ onClose, onCallEnded }: VoiceCallModalProps) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [callId, setCallId] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [statusText, setStatusText] = useState("Ready to start");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showForm, setShowForm] = useState(true);
  const [isTwilioCall, setIsTwilioCall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setSilenceCount] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioDoneRef = useRef<(() => void) | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const callIdRef = useRef<number | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const isListeningRef = useRef(false);
  const handleEndCallRef = useRef<(id: number, reason?: string) => Promise<void>>(async () => {});
  const startListeningRef = useRef<(id: number, count: number) => void>(() => {});
  const speakAIRef = useRef<(text: string, id: number) => Promise<void>>(async () => {});

  // Mic/recording infrastructure, reused across the whole call.
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserStreamIdRef = useRef<string | null>(null);
  const activeCaptureRef = useRef<Capture | null>(null);
  const interruptCaptureRef = useRef<Capture | null>(null);
  const lastSubmittedRef = useRef<{ text: string; at: number } | null>(null);
  // Prevent overlapping capture callbacks from submitting duplicate turns.
  const messageInFlightRef = useRef(false);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Keep callId in ref for use in callbacks
  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!isTwilioCall || !callId || phase === "ended") return;
    const timer = window.setInterval(() => {
      getCallDetail(callId).then((detail) => {
        if (detail.status !== "active" && detail.status !== "connected") {
          setPhase("ended");
          setStatusText(detail.status === "no_answer" ? "Call was not answered." : "Phone call ended.");
          onCallEnded();
        }
      }).catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isTwilioCall, callId, phase, onCallEnded]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioDoneRef.current) {
      audioDoneRef.current();
      audioDoneRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /** Stop any in-progress microphone capture for the main listen loop. */
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    activeCaptureRef.current?.cancel();
    activeCaptureRef.current = null;
  }, []);

  // Clean up on unmount — release the mic, stop audio, save partial transcript
  useEffect(() => {
    return () => {
      stopListening();
      interruptCaptureRef.current?.cancel();
      interruptCaptureRef.current = null;
      stopSpeaking();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      const id = callIdRef.current;
      if (id && phaseRef.current !== "idle" && phaseRef.current !== "ended") {
        endCall(id, "disconnected").catch(() => {});
      }
    };
  }, [stopListening, stopSpeaking]);

  const addTranscriptLine = useCallback((speaker: "AI" | "Customer", message: string) => {
    setTranscript(prev => [...prev, { speaker, message, timestamp: new Date() }]);
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }, []);

  /** Get (or reuse) a persistent microphone MediaStream for this call. */
  const getMicStream = useCallback(async (): Promise<MediaStream> => {
    const existing = micStreamRef.current;
    if (existing && existing.getAudioTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = stream;
    return stream;
  }, []);

  /** Ensure an AnalyserNode is wired up to the given stream for volume metering. */
  const ensureAudioAnalysis = useCallback((stream: MediaStream): AnalyserNode => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    if (!analyserRef.current || analyserStreamIdRef.current !== stream.id) {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      analyserStreamIdRef.current = stream.id;
    }
    return analyserRef.current;
  }, []);

  /** Current mic volume, roughly 0 (silence) to ~1 (loud), via RMS of the waveform. */
  const getAudioLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const norm = (data[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    return Math.sqrt(sumSquares / data.length);
  }, []);

  /**
   * Record microphone audio until the customer stops talking (or a timeout
   * is hit), returning the recorded clip. Resolves to `null` if no speech
   * was detected within `waitForSpeechMs`. The returned `cancel()` lets a
   * caller abort early (e.g. the call ends, or the AI's own speech finished
   * and an interrupt-listener is no longer needed) — cancelling always
   * discards the clip.
   */
  const startCapture = useCallback(
    (opts: CaptureOptions): Capture => {
      let cancelled = false;
      let cancelFn: () => void = () => {
        cancelled = true;
      };

      const promise = (async (): Promise<Blob | null> => {
        const stream = await getMicStream();
        if (cancelled) return null;

        ensureAudioAnalysis(stream);
        const mimeType = pickMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        console.info(
          "Starting MediaRecorder:",
          recorder.mimeType || mimeType || "browser default"
        );

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        return new Promise<Blob | null>((resolve) => {
          let finished = false;
          let poll: ReturnType<typeof setInterval> | null = null;

          const finish = (hadSpeech: boolean) => {
            if (finished) return;
            finished = true;
            if (poll) {
              clearInterval(poll);
              poll = null;
            }
            const settle = () => {
              const type = recorder.mimeType || mimeType || "audio/webm";
              const blob =
                hadSpeech && chunks.length > 0
                  ? new Blob(chunks, { type })
                  : null;

              // Do not send empty/tiny MediaRecorder output to Whisper.
              // Such blobs can cause faster-whisper to raise:
              // "ValueError: max() iterable argument is empty".
              if (!blob || blob.size < 1000) {
                console.warn(
                  "Discarding unusable microphone recording:",
                  blob ? `${blob.size} bytes` : "no blob"
                );
                resolve(null);
                return;
              }

              console.info(
                "Microphone recording ready:",
                blob.size,
                "bytes",
                blob.type
              );
              resolve(blob);
            };

            if (recorder.state !== "inactive") {
              recorder.onstop = settle;
              try {
                // Flush any pending MediaRecorder data before stopping.
                if (typeof recorder.requestData === "function") {
                  recorder.requestData();
                }
                recorder.stop();
              } catch {
                settle();
              }
            } else {
              settle();
            }
          };

          cancelFn = () => finish(false);
          if (cancelled) {
            finish(false);
            return;
          }

          try {
            recorder.start(250);
          } catch {
            finish(false);
            return;
          }

          let spoke = !!opts.skipWaitForSpeech;
          let lastLoudAt = Date.now();
          const startedAt = Date.now();

          poll = setInterval(() => {
            const level = getAudioLevel();
            const now = Date.now();
            if (level > SPEECH_VOLUME_THRESHOLD) {
              spoke = true;
              lastLoudAt = now;
            }
            const elapsed = now - startedAt;
            if (!spoke && elapsed >= opts.waitForSpeechMs) {
              finish(false);
              return;
            }
            if (spoke && now - lastLoudAt >= opts.silenceAfterSpeechMs) {
              finish(true);
              return;
            }
            if (elapsed >= opts.maxDurationMs) {
              finish(spoke);
              return;
            }
          }, LEVEL_POLL_INTERVAL_MS);
        });
      })();

      return {
        promise,
        cancel: () => cancelFn(),
      };
    },
    [getMicStream, ensureAudioAnalysis, getAudioLevel]
  );

  /** Browser-native TTS fallback (used only if the backend TTS call fails) */
  const browserTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  /** Speak the AI response using gTTS audio from backend; listen for a spoken interruption meanwhile. */
  const speakAI = useCallback(async (text: string, currentCallId: number) => {
    stopListening();
    setPhase("speaking");
    setStatusText("AI is speaking... (you can interrupt by speaking)");
    addTranscriptLine("AI", text);

    let interrupted = false;

    // Listen for the customer barging in while the AI is talking. This
    // capture is cancelled (discarded) once the AI finishes speaking
    // normally; if it resolves with a clip first, that means the customer
    // started talking, so we cut the AI off and handle their speech.
    const interruptCapture = startCapture({
      waitForSpeechMs: 60_000,
      silenceAfterSpeechMs: 1000,
      maxDurationMs: 15_000,
    });
    interruptCaptureRef.current = interruptCapture;

    interruptCapture.promise
      .then(async (blob) => {
        if (!blob) return; // cancelled, or no speech detected before AI finished
        interrupted = true;
        stopSpeaking();
        setPhase("processing");
        setStatusText("Transcribing...");

        let speechText = "";
        try {
          const result = await transcribeAudio(blob);
          speechText = (result.text || "").trim();
        } catch (error) {
          showError(error instanceof Error ? error.message : "Speech transcription failed.");
          startListeningRef.current(currentCallId, 0);
          return;
        }

        if (!speechText) {
          setStatusText("I couldn't hear that. Listening again...");
          startListeningRef.current(currentCallId, 0);
          return;
        }

        const previous = lastSubmittedRef.current;
        if (previous?.text.toLowerCase() === speechText.toLowerCase() && Date.now() - previous.at < 5000) {
          startListeningRef.current(currentCallId, 0);
          return;
        }
        lastSubmittedRef.current = { text: speechText, at: Date.now() };

        // Only one customer turn may be submitted at a time.
        // This prevents duplicate /calls/{id}/message requests when
        // capture callbacks overlap.
        if (messageInFlightRef.current) {
          console.warn(
            "Ignoring duplicate customer turn while another message is in flight."
          );
          return;
        }

        messageInFlightRef.current = true;
        addTranscriptLine("Customer", speechText);
        setStatusText("AI is thinking...");
        try {
          const response = await sendMessage(currentCallId, speechText);

          if (response.call_ended) {
            await handleEndCallRef.current(currentCallId, "completed");
            return;
          }

          await speakAIRef.current(response.ai_response, currentCallId);
          startListeningRef.current(currentCallId, 0);
        } catch {
          showError("Error communicating with AI. Please try again.");
          startListeningRef.current(currentCallId, 0);
        } finally {
          messageInFlightRef.current = false;
        }
      })
      .catch(() => {
        // No mic access for interruption purposes - not fatal, barge-in is
        // simply unavailable for this turn.
      });

    const waitForAudio = (base64Audio: string): Promise<void> =>
      new Promise((resolve, reject) => {
        if (!base64Audio) {
          resolve();
          return;
        }
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audioRef.current = audio;
        const done = () => {
          audioDoneRef.current = null;
          resolve();
        };
        const fail = (error: unknown) => {
          audioDoneRef.current = null;
          reject(error);
        };
        audioDoneRef.current = done;
        audio.onended = done;
        audio.onerror = () => fail(new Error("gTTS audio playback failed"));
        audio.play().catch(fail);
      });

    try {
      const audioBase64 = await getCallAudio(currentCallId, text);
      if (audioBase64 && !interrupted) {
        await waitForAudio(audioBase64);
      } else if (!interrupted) {
        console.warn("gTTS audio unavailable; using browser speech synthesis.");
        await browserTTS(text);
      }
    } catch {
      if (!interrupted) {
        console.warn("gTTS request or playback failed; using browser speech synthesis.");
        await browserTTS(text);
      }
    } finally {
      stopSpeaking();
      interruptCaptureRef.current?.cancel();
      interruptCaptureRef.current = null;
    }
  }, [addTranscriptLine, showError, stopSpeaking, stopListening, startCapture, browserTTS]);

  /** Record the customer's turn, transcribe it via the backend, and continue the conversation. */
  const startListening = useCallback((currentCallId: number, currentSilenceCount: number) => {
    setPhase("listening");
    setStatusText("Listening... (speak now)");
    isListeningRef.current = true;

    const capture = startCapture({
      waitForSpeechMs: 8000,
      silenceAfterSpeechMs: 1200,
      maxDurationMs: 20_000,
    });
    activeCaptureRef.current = capture;

    capture.promise
      .then(async (blob) => {
        isListeningRef.current = false;
        activeCaptureRef.current = null;
        if (!callIdRef.current || phaseRef.current === "ended") return;

        if (!blob) {
          // No speech detected within the wait window - same handling as
          // the old SpeechRecognition "no-speech" error.
          if (currentSilenceCount >= 1) {
            setStatusText("Call ended due to silence");
            await handleEndCallRef.current(currentCallId, "customer_silent");
          } else {
            await speakAIRef.current("Are you still there? I didn't hear anything.", currentCallId);
            setSilenceCount(prev => prev + 1);
            startListeningRef.current(currentCallId, currentSilenceCount + 1);
          }
          return;
        }

        setSilenceCount(0);
        setPhase("processing");
        setStatusText("Transcribing...");

        let speechText = "";
        try {
          const result = await transcribeAudio(blob);
          speechText = (result.text || "").trim();
        } catch (error) {
          showError(error instanceof Error ? error.message : "Speech transcription failed.");
          startListeningRef.current(currentCallId, 0);
          return;
        }

        if (!speechText) {
          // Whisper received no usable speech. Do not call Gemini with an
          // empty message; simply start a fresh recording attempt.
          setStatusText("I couldn't hear that. Listening again...");
          startListeningRef.current(currentCallId, currentSilenceCount);
          return;
        }

        const previous = lastSubmittedRef.current;
        if (previous?.text.toLowerCase() === speechText.toLowerCase() && Date.now() - previous.at < 5000) {
          startListeningRef.current(currentCallId, 0);
          return;
        }
        lastSubmittedRef.current = { text: speechText, at: Date.now() };

        // Only one customer turn may be submitted at a time.
        // This prevents duplicate /calls/{id}/message requests when
        // capture callbacks overlap.
        if (messageInFlightRef.current) {
          console.warn(
            "Ignoring duplicate customer turn while another message is in flight."
          );
          return;
        }

        messageInFlightRef.current = true;
        addTranscriptLine("Customer", speechText);
        setStatusText("AI is thinking...");

        try {
          const response = await sendMessage(currentCallId, speechText);

          if (response.call_ended) {
            await handleEndCallRef.current(currentCallId, "completed");
            return;
          }

          await speakAIRef.current(response.ai_response, currentCallId);
          startListeningRef.current(currentCallId, 0);
        } catch {
          showError("Error communicating with AI. Please try again.");
          startListeningRef.current(currentCallId, 0);
        } finally {
          messageInFlightRef.current = false;
        }
      })
      .catch((err: unknown) => {
        isListeningRef.current = false;
        activeCaptureRef.current = null;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          showError("Microphone permission denied.");
          handleEndCallRef.current(currentCallId, "stt_failure");
        } else if (name === "NotFoundError") {
          showError("No microphone found. Please connect a microphone and try again.");
          setPhase("ended");
        } else {
          showError("Could not access the microphone. Please check your device and permissions.");
          setPhase("ended");
        }
      });
  }, [addTranscriptLine, showError, startCapture]);

  const handleEndCall = useCallback(async (currentCallId: number, reason = "completed") => {
    stopListening();
    interruptCaptureRef.current?.cancel();
    interruptCaptureRef.current = null;
    stopSpeaking();
    setPhase("ended");
    setStatusText("Call ended. Generating summary...");

    try {
      await endCall(currentCallId, reason);
      setStatusText("Call complete. Summary saved.");
      onCallEnded();
    } catch {
      setStatusText("Call ended (could not save summary).");
    }
  }, [onCallEnded, stopSpeaking, stopListening]);

  // Keep the latest versions of these callbacks in refs so that other
  // callbacks (which can't list them as deps without creating update
  // cycles) always call the most recent implementation.
  useEffect(() => {
    handleEndCallRef.current = handleEndCall;
  }, [handleEndCall]);
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);
  useEffect(() => {
    speakAIRef.current = speakAI;
  }, [speakAI]);

  /** Start the call flow */
  const handleStartCall = async () => {
    const phone = customerPhone.trim();
    if (phone && !/^(\+\d{10,15}|\d{10}|91\d{10})$/.test(phone.replace(/[\s\-()]/g, ""))) {
      showError("Invalid phone. Use 10 digits or +91… format.");
      return;
    }

    setShowForm(false);
    setPhase("starting");
    setStatusText("Starting call...");
    setError(null);
    lastSubmittedRef.current = null;
    messageInFlightRef.current = false;

    try {
      const data = await startCall(customerName || undefined, phone || undefined);
      setCallId(data.call_id);

      if (data.call_mode === "twilio") {
        setIsTwilioCall(true);
        addTranscriptLine("AI", data.ai_greeting);
        setPhase("listening");
        setStatusText("Calling your phone. Answer the call to talk with Priya.");
        setShowForm(false);
        return;
      }

      if (!isRecordingSupported()) {
        throw new Error("Your browser doesn't support audio recording. Please use a recent version of Chrome, Edge, Firefox, or Safari.");
      }

      // Ask for microphone permission before starting the browser call flow.
      await getMicStream();
      setPhase("greeting");
      setStatusText("AI is greeting...");

      // Speak the AI greeting
      await speakAI(data.ai_greeting, data.call_id);

      // Start listening after greeting
      startListening(data.call_id, 0);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone permission denied. Please allow microphone access and try again.");
      } else {
        const msg = err instanceof Error ? err.message : "Failed to start call. Is the backend running?";
        setError(msg);
      }
      setPhase("idle");
      setShowForm(true);
    }
  };

  const handleManualEnd = () => {
    if (callId) {
      handleEndCall(callId, "customer_ended");
    } else {
      onClose();
    }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-t-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">🤖 AI RO Sales Agent</h2>
              <p className="text-blue-200 text-sm">AquaPure Commercial RO Systems</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Status indicator */}
              <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
                <div className={`w-2 h-2 rounded-full ${
                  phase === "listening" ? "bg-green-400 animate-pulse" :
                  phase === "speaking" ? "bg-yellow-400 animate-pulse" :
                  phase === "processing" ? "bg-orange-400 animate-pulse" :
                  phase === "ended" ? "bg-gray-400" :
                  "bg-blue-300"
                }`} />
                <span className="text-xs font-medium">{
                  phase === "listening" ? "Listening" :
                  phase === "speaking" ? "AI Speaking" :
                  phase === "processing" ? "Processing" :
                  phase === "ended" ? "Call Ended" :
                  phase === "starting" ? "Connecting" :
                  "Ready"
                }</span>
              </div>
              {phase !== "idle" && (
                <button
                  onClick={handleManualEnd}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-1.5 text-sm font-medium transition"
                >
                  End Call
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Customer Info Form */}
          {showForm && (
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-4">Customer Information (Optional)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g., Rahul Kumar"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Phone Number (required for Twilio)</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="e.g., 9876543210"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Use your verified phone number for trial calls.</p>
                </div>
              </div>
              <button
                onClick={handleStartCall}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <span>📞</span> Start AI Call
              </button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Browser calls use your microphone; Twilio mode rings the entered phone number.
              </p>
            </div>
          )}

          {/* Status Banner */}
          {!showForm && phase !== "ended" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-blue-800 font-medium">{statusText}</p>
              {phase === "listening" && (
                <div className="flex justify-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div
                      key={i}
                      className="w-1 bg-blue-500 rounded-full animate-bounce"
                      style={{ height: `${8 + ((i * 7) % 5) * 3}px`, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Call Ended Banner */}
          {phase === "ended" && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-green-800 font-semibold">{statusText}</p>
              {callId && (
                <a
                  href={`/calls/${callId}`}
                  className="inline-block mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium underline"
                >
                  View Call Details →
                </a>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Transcript */}
          {transcript.length > 0 && (
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Live Transcript
              </h3>
              <div className="space-y-3">
                {transcript.map((line, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${line.speaker === "AI" ? "" : "flex-row-reverse"}`}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      line.speaker === "AI"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}>
                      {line.speaker === "AI" ? "🤖" : "👤"}
                    </div>
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                      line.speaker === "AI"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      <p className="text-sm leading-relaxed">{line.message}</p>
                      <p className={`text-xs mt-1 ${
                        line.speaker === "AI" ? "text-blue-200" : "text-gray-400"
                      }`}>
                        {line.speaker} · {line.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            {callId ? `Call ID: #${callId}` : "No active call"}
          </p>
          <button
            onClick={phase === "ended" ? onClose : handleManualEnd}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              phase === "ended"
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                : "bg-red-100 hover:bg-red-200 text-red-700"
            }`}
          >
            {phase === "ended" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
