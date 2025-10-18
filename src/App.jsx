import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function usePageTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}
function useFavicon(url) {
  useEffect(() => {
    const old = document.querySelectorAll('link[rel="icon"]');
    old.forEach((el) => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = url;
    document.head.appendChild(link);
  }, [url]);
}

export default function App() {
  usePageTitle("ZenSense Ultra Minimal Focus Timer");
  useFavicon("enso.svg");

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [bellInterval, setBellInterval] = useState(10);
  const [muted, setMuted] = useState(true);
  const bgAudioRef = useRef(null);
  const TARGET_VOL = 0.18;

  // Determine audio path dynamically depending on environment
  const basePath = window.location.pathname.includes('/zensense') ? '/zensense/' : '/';
  const AUDIO_SRC = `${basePath}meditation_1_low10mb.mp3`;

  useEffect(() => {
    const a = new Audio(AUDIO_SRC);
    a.loop = true;
    a.volume = TARGET_VOL;
    a.muted = true;
    bgAudioRef.current = a;
    a.play().catch(() => {});
    return () => { try { a.pause(); } catch {}; bgAudioRef.current = null; };
  }, [AUDIO_SRC]);

  const setMutedState = (next) => {
    setMuted(next);
    const a = bgAudioRef.current; if (!a) return;
    a.muted = next;
    if (!next) {
      const p = a.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          window.addEventListener('pointerdown', () => a.play().catch(() => {}), { once: true });
        });
      }
    }
  };

  useEffect(() => {
    let id;
    if (running) {
      id = setInterval(() => setElapsed((t) => t + 1), 1000);
    }
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    setRunning(true);
    setShowTimer(true);
    setHasStarted(true);
    setMutedState(false);
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setElapsed(0);
    setShowTimer(false);
    setHasStarted(false);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "linear-gradient(160deg, #0d0f17 0%, #121829 100%)",
        color: "#fff", overflow: "hidden", textAlign: "center"
      }}
    >
      {/* Mute Button (fixed) */}
      <button
        onClick={() => setMutedState(!muted)}
        aria-label={muted ? "Unmute site audio" : "Mute site audio"}
        title={muted ? "Unmute" : "Mute"}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "50%", width: "min(60px, 10vw)", height: "min(60px, 10vw)", display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", backdropFilter: "blur(6px)", color: "white"
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "min(32px, 5vw)", height: "min(32px, 5vw)", display: "block", transform: "translate(3px, 1px)" }}
        >
          <path d="M3 9v6h4l5 4V5L7 9H3z" stroke="white" strokeWidth="1.8" fill="none" />
          {!muted && <path d="M16 7c1.657 1.667 1.657 7.333 0 9" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
          {muted && <line x1="1" y1="21" x2="19" y2="3" stroke="white" strokeWidth="1.8"/>}
        </svg>
      </button>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { width: 100vw; height: 100vh; margin: 0; padding: 0; overflow: hidden; }
        body { background: #0d0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; }
        .tagline { white-space: nowrap; }
        @media (max-width: 680px) { .tagline { white-space: normal; } }
      `}</style>

      <section
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(920px, 92vw)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "4vh",
          padding: "0 1rem"
        }}
      >
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: "-2vh" }}>
          <img src="Zensense_Text_Only.png" alt="ZenSense Logo" style={{ width: 163, maxWidth: "40vw", filter: "brightness(0) invert(1)", display: "block", margin: "0 auto 0.25rem auto", transform: "translateY(-65px)" }} />
          <p className="tagline" style={{ fontSize: "1rem", opacity: 0.7, marginTop: "0.25rem", letterSpacing: 0.3, maxWidth: 860, width: "92%", marginLeft: "auto", marginRight: "auto", textAlign: "center", transform: "translateY(-55px)" }}>
            Your ultra-minimal focus timer for meditation & productivity.
          </p>
        </header>

        {/* Main */}
        <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem" }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={running ? pause : start}
            style={{ height: "18rem", width: "18rem", borderRadius: "50%", border: "2px solid rgba(56,189,248,0.7)", color: "#fff", background: "transparent", fontSize: "2rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(56,189,248,0.6)" }}
          >
            {running ? "PAUSE" : hasStarted ? "RESUME" : "START"}
          </motion.button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
            <span>Bell every</span>
            {!hasStarted ? (
              <select value={bellInterval} onChange={(e) => setBellInterval(parseInt(e.target.value))} style={{ background: "transparent", border: "1px solid #64748b", borderRadius: 6, padding: "4px 8px", color: "white" }}>
                {[2, 5, 10, 15, 20, 30].map((v) => <option key={v} value={v} style={{ color: "black" }}>{v}</option>)}
              </select>
            ) : (
              <div style={{ border: "1px solid #64748b", borderRadius: 6, padding: "4px 12px", opacity: 0.9 }}>{bellInterval}</div>
            )}
            <span>minutes</span>
          </div>

          <div style={{ minHeight: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", marginTop: "0.5rem" }}>
            <AnimatePresence initial={false}>
              {showTimer && (
                <motion.div key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} style={{ fontSize: "3rem", fontWeight: 700, marginTop: "0.5rem" }} aria-live="polite">
                  {`${mm}:${ss}`}
                </motion.div>
              )}
              {showTimer && (
                <motion.button key="reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: 0.1 }} onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1.5rem", borderRadius: 10, border: "2px solid rgba(248,113,113,0.8)", background: "transparent", color: "white", fontWeight: 600, fontSize: "0.9rem" }}>
                  RESET
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </main>
      </section>

      {/* Footer pinned to bottom edge */}
      <footer style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", textAlign: "center", padding: "16px 0", opacity: 0.7, fontSize: 12 }}>
        No tracking, no sign-in. Just peace.
      </footer>
    </div>
  );
}
