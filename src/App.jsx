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
  const [muted, setMuted] = useState(true); // controls background music only

  const bgAudioRef = useRef(null);
  const bellCtxRef = useRef(null); // web audio for bell (never muted by UI)
  const audioElRef = useRef(null); // html <audio> for iOS reliability

  const TARGET_VOL = 0.18;
  const basePath = window.location.pathname.includes('/zensense') ? '/zensense/' : '/';
  const AUDIO_SRC = `${basePath}meditation_1_low10mb.mp3`;

  // --- Background music setup (muted until user unmutes) ---
  useEffect(() => {
    let a = audioElRef.current;
    if (!a) a = new Audio();
    a.src = AUDIO_SRC;
    a.preload = 'auto';
    a.loop = true;
    a.volume = TARGET_VOL;
    a.muted = true; // start muted for autoplay policies
    bgAudioRef.current = a;
    try { a.load(); } catch {}
    a.play().catch(() => {});
    return () => { try { a.pause(); } catch {} bgAudioRef.current = null; };
  }, [AUDIO_SRC]);

  const setMutedState = (next) => {
    setMuted(next);
    const a = bgAudioRef.current; if (!a) return;
    try { a.muted = next; } catch {}
    if (!next) {
      const p = a.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          const resume = () => a.play().catch(() => {});
          window.addEventListener('pointerup', resume, { once: true });
        });
      }
    }
  };
  const toggleMute = () => setMutedState(!muted);

  // --- Bell (Web Audio, not affected by mute) ---
  const ensureBellCtx = () => {
    if (!bellCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      bellCtxRef.current = new AudioCtx();
    }
    return bellCtxRef.current;
  };
  const playBell = () => {
    const ctx = ensureBellCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(880, now);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(1318.5, now);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(400, now);

    o1.connect(g); o2.connect(g); g.connect(hp); hp.connect(ctx.destination);
    o1.start(now); o2.start(now); o1.stop(now + 3.3); o2.stop(now + 3.3);
    setTimeout(() => { try { g.disconnect(); hp.disconnect(); } catch {} }, 3400);
  };

  // --- Timer (counts up indefinitely) ---
  useEffect(() => {
    let id;
    if (running) id = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // --- Bell schedule ---
  useEffect(() => {
    if (!running) return;
    const period = bellInterval * 60;
    if (period > 0 && elapsed > 0 && elapsed % period === 0) playBell();
  }, [elapsed, running, bellInterval]);

  // --- Controls ---
  const start = () => {
    setRunning(true);
    setShowTimer(true);
    setHasStarted(true);
    setMutedState(false); // unmute music on start
    const ctx = ensureBellCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setElapsed(0); setShowTimer(false); setHasStarted(false); };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const buttonColor = running ? "rgba(34,197,94,0.7)" : "rgba(56,189,248,0.7)";
  const glowColor = running ? "rgba(34,197,94,0.6)" : "rgba(56,189,248,0.6)";

  const globalFont = { fontFamily: "'Helvetica Neue', Arial, sans-serif" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(circle at center, #0d0f17 0%, #121829 100%)", color: "#fff", overflowX: "hidden", overflowY: "auto", textAlign: "center", ...globalFont }}>
      {/* Audio toggle */}
      <button
        onPointerUp={toggleMute}
        aria-label={muted ? "Unmute site audio" : "Mute site audio"}
        title={muted ? "Unmute" : "Mute"}
        style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: "min(60px, 10vw)", height: "min(60px, 10vw)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)", willChange: "transform, opacity", transform: "translateZ(0)", zIndex: 10, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "min(32px, 5vw)", height: "min(32px, 5vw)", display: "block", transform: "translate(3px, 1px)" }}>
          <path d="M3 9v6h4l5 4V5L7 9H3z" stroke="white" strokeWidth="1.8" fill="none" />
          {!muted && <path d="M16 7c1.657 1.667 1.657 7.333 0 9" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
          {muted && <line x1="1" y1="21" x2="19" y2="3" stroke="white" strokeWidth="1.8"/>}
        </svg>
      </button>

      {/* Hidden audio element for iOS */}
      <audio ref={audioElRef} playsInline style={{ display: 'none' }} />

      {/* Styles for layout & mobile behavior */}
      <style>{`
        body, p, span, div, select, button, footer { font-family: 'Helvetica Neue', Arial, sans-serif; }
        select { font-size: 1rem; }
        .tagline { white-space: nowrap; text-align: center; }
        .header-logo { display: block; margin: 0 auto; filter: brightness(0) invert(1); }
        .core { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(920px, 92vw); display: flex; flex-direction: column; align-items: center; gap: 4vh; padding: 0 1rem; }
        .main-stack { margin-top: 1.25rem; }
        @media (max-width: 680px) {
          html, body, #root { height: 100%; }
          .tagline { white-space: normal; margin-top: 2rem; }
          .header-logo { margin-bottom: 0.75rem; }
          select { font-size: 1rem; }
          .core { position: static; transform: none; margin: 0 auto; width: min(920px, 92vw); min-height: calc(100vh - 72px); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10vh 1rem 88px; }
          .main-stack { margin-top: 0; }
        }
      `}</style>

      {/* MAIN CONTENT */}
      <section className="core">
        <header style={{ textAlign: "center", marginBottom: "-2vh" }}>
          <img src="Zensense_Text_Only.png" alt="ZenSense Logo" className="header-logo" style={{ width: 163, maxWidth: "40vw" }} />
          <p className="tagline" style={{ fontSize: "1rem", opacity: 0.7, marginTop: "1.25rem", letterSpacing: 0.3, maxWidth: 860, width: "92%", marginLeft: "auto", marginRight: "auto" }}>
            Your ultra-minimal focus timer for meditation & productivity.
          </p>
        </header>

        <main className="main-stack" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem" }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={running ? pause : start}
            style={{ height: "18rem", width: "18rem", borderRadius: "50%", border: `2px solid ${buttonColor}`, color: "#fff", background: "transparent", fontSize: "2rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 40px ${glowColor}` }}
          >
            {running ? "PAUSE" : hasStarted ? "RESUME" : "START"}
          </motion.button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
            <span>Bell every</span>
            {!hasStarted ? (
              <select value={bellInterval} onChange={(e) => setBellInterval(parseInt(e.target.value))} style={{ background: "transparent", border: "1px solid #64748b", borderRadius: 6, padding: "4px 8px", color: "white", fontSize: "1rem" }}>
                {[2, 5, 10, 15, 20, 30].map((v) => <option key={v} value={v} style={{ color: "black" }}>{v}</option>)}
              </select>
            ) : (
              <div style={{ border: "1px solid #64748b", borderRadius: 6, padding: "4px 12px", opacity: 0.9, fontSize: "1rem" }}>{bellInterval}</div>
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

      {/* FOOTER */}
      <footer style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", textAlign: "center", padding: "16px 0", opacity: 0.7, fontSize: 12 }}>
        No tracking, no sign-in. Just peace.
      </footer>
    </div>
  );
}
