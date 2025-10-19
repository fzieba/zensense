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
  const bellCtxRef = useRef(null);
  const audioElRef = useRef(null);
  const bellAudioRef = useRef(null);
  const coreRef = useRef(null);
  const footerRef = useRef(null);

  const TARGET_VOL = 0.18;
  const basePath = window.location.pathname.includes('/zensense') ? '/zensense/' : '/';
  const AUDIO_SRC = `${basePath}meditation_1_low10mb.mp3`;
  const BELL_SRC = `${basePath}bells-1-72261.mp3`;

  useEffect(() => {
    let a = audioElRef.current;
    if (!a) a = new Audio();
    a.src = AUDIO_SRC;
    a.preload = 'auto';
    a.loop = true; // native loop
    a.volume = TARGET_VOL;
    a.muted = true; // start muted for autoplay policies
    bgAudioRef.current = a;

    // Ensure seamless, infinite looping across browsers
    const onEnded = () => {
      try { a.currentTime = 0; } catch {}
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    a.addEventListener('ended', onEnded);

    // Resume if tab regains focus and user has unmuted
    const onVis = () => {
      if (!document.hidden && a && !a.muted) {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);

    try { a.load(); } catch {}
    a.play().catch(() => {});

    return () => {
      try { a.pause(); } catch {}
      try { a.removeEventListener('ended', onEnded); } catch {}
      document.removeEventListener('visibilitychange', onVis);
      bgAudioRef.current = null;
    };
  }, [AUDIO_SRC]);

  // Preload bell audio (independent from bg music & mute state)
  useEffect(() => {
    let b = bellAudioRef.current;
    if (!b) b = new Audio();
    b.src = BELL_SRC;
    b.preload = 'auto';
    b.loop = false;
    b.volume = 0.9; // strong but not harsh
    bellAudioRef.current = b;
    try { b.load(); } catch {}
    return () => { try { b.pause(); } catch {} };
  }, [BELL_SRC]);

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

  const ensureBellCtx = () => {
    if (!bellCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      bellCtxRef.current = new AudioCtx();
    }
    return bellCtxRef.current;
  };

  const playBell = () => {
    const b = bellAudioRef.current;
    if (!b) return;
    try { b.currentTime = 0; } catch {}
    const p = b.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  useEffect(() => {
    let id;
    if (running) id = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const period = bellInterval * 60;
    if (period > 0 && elapsed > 0 && elapsed % period === 0) playBell();
  }, [elapsed, running, bellInterval]);

  const start = () => {
    setRunning(true);
    setShowTimer(true);
    // Ring bell only on the very first start (not on resume)
    if (!hasStarted) playBell();
    setHasStarted(true);
    setMutedState(false);
    // No WebAudio bell context needed anymore here
  };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setElapsed(0); setShowTimer(false); setHasStarted(false); };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const buttonColor = running ? "rgba(34,197,94,0.7)" : "rgba(56,189,248,0.7)";
  const glowColor = running ? "rgba(34,197,94,0.6)" : "rgba(56,189,248,0.6)";

  const globalFont = { fontFamily: "'Helvetica Neue', Arial, sans-serif" };

  // Dynamically scale desktop layout to fit viewport without overlap
  useEffect(() => {
    const el = coreRef.current;
    const footer = footerRef.current;
    if (!el) return;
    const calc = () => {
      // Only scale on desktop
      if (window.matchMedia('(max-width: 680px)').matches) {
        el.style.setProperty('--scale', '1');
        document.documentElement.style.setProperty('--scale', '1');
        return;
      }
      // Temporarily reset scale to measure natural height
      const prev = getComputedStyle(el).getPropertyValue('--scale');
      el.style.setProperty('--scale', '1');
      const naturalH = el.scrollHeight; // unscaled content height
      const footerH = footer ? footer.offsetHeight : 0;
      const available = window.innerHeight - footerH; // header is inside core
      const s = Math.min(1, Math.max(0.6, available / naturalH));
      el.style.setProperty('--scale', String(s));
      document.documentElement.style.setProperty('--scale', String(s));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(document.documentElement);
    ro.observe(el);
    window.addEventListener('orientationchange', calc);
    window.addEventListener('resize', calc);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('orientationchange', calc);
      window.removeEventListener('resize', calc);
    };
  }, []);

  return (
    <div className="page" style={{ background: "radial-gradient(circle at center, #0d0f17 0%, #121829 100%)", color: "#fff", textAlign: "center", ...globalFont }}>
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

      <audio ref={audioElRef} playsInline style={{ display: 'none' }} />

      <style>{`
        /* Reset & safety to remove any white gutters */
        html, body, #root { margin: 0; padding: 0; height: 100%; background: #0b0f19; }
        :root { --scale: 1; }
        * { box-sizing: border-box; }
        img { display: block; max-width: 100%; }

        /* Global typography */
        body, p, span, div, select, button, footer { font-family: 'Helvetica Neue', Arial, sans-serif; }
        select { font-size: 1rem; }
        .tagline { white-space: nowrap; text-align: center; }
        .header-logo { display: block; margin: 0 auto; filter: brightness(0) invert(1); }

        /* Page layout (desktop-first): one screen, no scroll, footer anchored */
        .page { min-height: 100vh; height: 100svh; display: flex; flex-direction: column; overflow: hidden; }
        .core { flex: 1; width: min(920px, 92vw); margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4vh; padding: 6vh 1rem 0; }
        .core-scale { transform-origin: top center; }
        @media (min-width: 681px) { .core-scale { transform: scale(var(--scale)); } }
        .main-stack { margin-top: 1.25rem; }
        footer { margin-top: auto; }

        /* Mobile overrides: allow scroll if needed, keep footer at bottom of content */
        @media (max-width: 680px) {
          html, body, #root, .page { height: auto; min-height: 100svh; }
          .page { overflow-x: hidden; overflow-y: auto; }
          .tagline { white-space: normal; margin-top: 1rem; }
          .header-logo { margin-bottom: 0.5rem; }
          select { font-size: 1rem; }
          .core { flex: unset; width: min(920px, 92vw); padding: 8vh 1rem 120px; justify-content: flex-start; }
          footer { position: static !important; padding-bottom: 1.5rem; }
        }
      `}</style>

      <section className="core core-scale" ref={coreRef}>
        <header style={{ textAlign: "center", marginBottom: "0" }}>
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

      <footer ref={footerRef} style={{ position: "static", left: 0, right: 0, width: "100%", textAlign: "center", padding: "16px 0", opacity: 0.7, fontSize: 12, background: "transparent" }}>
        No tracking, no sign-in. Just peace.
      </footer>
    </div>
  );
}
