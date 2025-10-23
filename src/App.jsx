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

  // --- State ---
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [bellInterval, setBellInterval] = useState(10);
  const [muted, setMuted] = useState(true); // background music only

  // --- Refs ---
  const bgAudioRef = useRef(null);
  const bellCtxRef = useRef(null);
  const bellBufferRef = useRef(null);
  const audioElRef = useRef(null);
  const bellAudioRef = useRef(null);
  const coreRef = useRef(null);
  const footerRef = useRef(null);
  const wakeLockRef = useRef(null);
  const noSleepVideoRef = useRef(null);
  const startMsRef = useRef(null);
  const bellNextMsRef = useRef(null);
  const audioWatchRef = useRef({ lastT: 0 });

  // --- Consts ---
  const TARGET_VOL = 0.18;
  const QUIET_VOL = 0.0001; // inaudible keepalive when hidden+muted
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window).MSStream;
  const basePath = window.location.pathname.includes('/zensense') ? '/zensense/' : '/';
  const AUDIO_SRC = `${basePath}meditation_1_low10mb.mp3`;
  const BELL_SRC = `${basePath}bells-1-72261.mp3`;

  // --- Bell player (fixed & working) ---
  const playBell = () => {
    // On iOS (all browsers use WebKit), prefer primed HTMLAudio for reliability
    if (isIOS && bellAudioRef.current) {
      const b = bellAudioRef.current;
      try { b.muted = false; b.currentTime = 0; b.volume = 0.9; } catch {}
      const p = b.play(); if (p && p.catch) p.catch(() => {});
      return;
    }
    // Else prefer WebAudio buffer
    const ctx = bellCtxRef.current;
    const buf = bellBufferRef.current;
    if (ctx && buf) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.setValueAtTime(1.0, ctx.currentTime);
        src.connect(g); g.connect(ctx.destination);
        src.start();
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch {} };
        return;
      } catch {}
    }
    // Fallback to HTMLAudio when buffer isn't ready
    const b = bellAudioRef.current;
    if (b) {
      try { b.muted = false; b.currentTime = 0; } catch {}
      const p = b.play(); if (p && p.catch) p.catch(() => {});
    }
  };

  // --- Background music (loops forever, resilient) ---
  useEffect(() => {
    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      const a = audioElRef.current; // **use the real <audio> element in the DOM**
      if (!a) {
        // Ref may not be ready on the very first effect tick — try again next frame
        requestAnimationFrame(init);
        return;
      }
      // Wire once
      if (bgAudioRef.current !== a) {
        bgAudioRef.current = a;

        // Ensure attributes for reliable muted autoplay
        try { a.autoplay = true; } catch {}
        try { a.playsInline = true; } catch {}
        try { a.muted = true; a.setAttribute('muted', ''); } catch {}
        try { a.loop = true; } catch {}
        try { a.preload = 'auto'; } catch {}
        try { a.volume = TARGET_VOL; } catch {}

        const onEnded = () => {
          try { a.currentTime = 0; } catch {}
          const p = a.play(); if (p && p.catch) p.catch(() => {});
        };
        a.addEventListener('ended', onEnded);

        const onVis = () => {
          if (!audioElRef.current) return;
          if (!document.hidden) {
            if (!muted) { a.volume = TARGET_VOL; a.muted = false; try { a.removeAttribute('muted'); } catch {} const p = a.play(); if (p && p.catch) p.catch(() => {}); }
            else { a.volume = TARGET_VOL; a.muted = true; a.setAttribute('muted',''); }
          } else {
            if (muted && running) { a.muted = false; a.volume = QUIET_VOL; }
          }
        };
        document.addEventListener('visibilitychange', onVis);

        const watch = setInterval(() => {
          const aW = audioElRef.current;
          if (!aW) return;
          if (running) {
            if (document.hidden && muted) { try { aW.muted = false; aW.volume = QUIET_VOL; } catch {} }
            if (!muted) { try { aW.volume = TARGET_VOL; aW.muted = false; } catch {} }
          }
          if (!muted && running) {
            const t = aW.currentTime || 0;
            const dt = Math.abs(t - (audioWatchRef.current.lastT || 0));
            audioWatchRef.current.lastT = t;
            if (aW.paused || aW.ended || dt < 0.5) { const p = aW.play(); if (p && p.catch) p.catch(() => {}); }
          }
          const ctx = bellCtxRef.current; if (ctx && ctx.state === 'suspended' && running) { try { ctx.resume(); } catch {} }
        }, 30000);

        const onCanPlay = () => { const p = a.play(); if (p && p.catch) p.catch(() => {}); };
        a.addEventListener('canplaythrough', onCanPlay, { once: true });

        // Prime playback on the very first user interaction so unmute works on the first tap
        const prime = () => { try { a.muted = true; a.setAttribute('muted',''); } catch {} const p = a.play(); if (p && p.catch) p.catch(() => {}); document.removeEventListener('pointerdown', prime); document.removeEventListener('touchstart', prime); };
        document.addEventListener('pointerdown', prime, { once: true, passive: true });
        document.addEventListener('touchstart', prime, { once: true, passive: true });

        try { a.load(); } catch {}
        a.play().catch(() => {});

        return () => {
          try { a.pause(); } catch {}
          try { a.removeEventListener('ended', onEnded); } catch {}
          try { a.removeEventListener('canplaythrough', onCanPlay); } catch {}
          document.removeEventListener('visibilitychange', onVis);
          try { clearInterval(watch); } catch {}
        };
      }
    };

    const cleanup = init();
    return () => { cancelled = true; if (typeof cleanup === 'function') cleanup(); };
  }, [AUDIO_SRC, muted, running]);

  // --- Site mute toggle (does not affect bell) ---
  const setMutedState = (next) => {
    setMuted(next);
    const a = bgAudioRef.current || audioElRef.current; if (!a) return;
    try {
      if (next) {
        if (document.hidden && running) { a.muted = false; a.volume = QUIET_VOL; }
        else { a.volume = TARGET_VOL; a.muted = true; }
      } else { a.volume = TARGET_VOL; a.muted = false; try { a.removeAttribute('muted'); } catch {} }
    } catch {}
    // Ensure playback is running; if it fails here, the prime-on-pointerdown handler will have already started it
    if (!next) {
      const p = a.play(); if (p && p.catch) p.catch(() => {});
    }
  };
  const toggleMute = () => setMutedState(!muted);

  // --- Preload bell into WebAudio buffer (with HTMLAudio fallback) ---
  useEffect(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = bellCtxRef.current || new AudioCtx();
    bellCtxRef.current = ctx;

    let aborted = false;
    (async () => {
      try {
        const res = await fetch(BELL_SRC, { cache: 'force-cache' });
        const arr = await res.arrayBuffer();
        if (aborted) return;
        const buf = await ctx.decodeAudioData(arr);
        if (!aborted) bellBufferRef.current = buf;
      } catch (e) {
        try {
          let b = bellAudioRef.current;
          if (!b) b = new Audio();
          b.src = BELL_SRC; b.preload = 'auto'; b.loop = false; b.volume = 0.9;
          bellAudioRef.current = b; b.load();
        } catch {}
      }
    })();
    return () => { aborted = true; };
  }, [BELL_SRC]);

  // --- Keep screen awake on mobile ---
  const requestWakeLock = async () => {
    try {
      if (navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
        try { if (wakeLockRef.current) { await wakeLockRef.current.release(); } } catch {}
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {}
  };
  const releaseWakeLock = async () => { try { if (wakeLockRef.current) { await wakeLockRef.current.release(); wakeLockRef.current = null; } } catch {} };
  const ensureNoSleepVideoPlaying = () => { const v = noSleepVideoRef.current; if (!v) return; v.muted = true; v.loop = true; v.playsInline = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  const stopNoSleepVideo = () => { const v = noSleepVideoRef.current; if (v) { try { v.pause(); } catch {} } };

  useEffect(() => {
    const onVis = () => {
      if (running && !document.hidden) {
        requestWakeLock();
        const v = noSleepVideoRef.current; if (v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [running]);

  // --- High-precision wall-clock timer + bell scheduler ---
  useEffect(() => {
    let id;
    const tick = () => {
      if (!running) return;
      const now = Date.now();
      if (startMsRef.current == null) { startMsRef.current = now - elapsed * 1000; }
      const seconds = Math.max(0, Math.floor((now - startMsRef.current) / 1000));
      if (seconds !== elapsed) setElapsed(seconds);
      const period = bellInterval * 60000;
      if (period > 0) {
        if (!bellNextMsRef.current) bellNextMsRef.current = now + period;
        if (bellNextMsRef.current && now >= bellNextMsRef.current) {
          const periodsMissed = Math.max(1, Math.floor((now - bellNextMsRef.current) / period) + 1);
          playBell();
          bellNextMsRef.current += periodsMissed * period;
        }
      }
    };
    if (running) id = setInterval(tick, 250);
    return () => { if (id) clearInterval(id); };
  }, [running, bellInterval, elapsed]);

  // --- Controls ---
  const start = async () => {
    setRunning(true);
    setShowTimer(true);

    // Unlock bell audio on iOS/any WebKit browser during this user gesture
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!bellCtxRef.current || bellCtxRef.current.state === 'closed') { bellCtxRef.current = new AudioCtx(); }
        if (bellCtxRef.current.state !== 'running') { await bellCtxRef.current.resume().catch(() => {}); }
        if (!bellBufferRef.current) {
          try {
            let b = bellAudioRef.current; if (!b) b = new Audio();
            b.src = BELL_SRC; b.preload = 'auto'; b.loop = false; b.volume = 0.9; bellAudioRef.current = b; b.load();
          } catch {}
        }
        if (isIOS && bellAudioRef.current) {
          const b = bellAudioRef.current; const prevVol = b.volume; b.volume = 0; const p = b.play(); if (p && p.catch) await p.catch(() => {}); try { b.pause(); } catch {}; b.currentTime = 0; b.volume = prevVol;
        }
      }
    } catch {}

    if (!hasStarted) playBell();
    setHasStarted(true);

    setMutedState(false);

    const now = Date.now();
    if (startMsRef.current == null) startMsRef.current = now - elapsed * 1000;
    bellNextMsRef.current = now + bellInterval * 60000;

    requestWakeLock();
    ensureNoSleepVideoPlaying();
  };
  const pause = () => { setRunning(false); releaseWakeLock(); stopNoSleepVideo(); };
  const reset = () => { setRunning(false); setElapsed(0); setShowTimer(false); setHasStarted(false); releaseWakeLock(); stopNoSleepVideo(); startMsRef.current = null; bellNextMsRef.current = null; };

  // --- Derived display ---
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const buttonColor = running ? "rgba(34,197,94,0.7)" : "rgba(56,189,248,0.7)";
  const glowColor = running ? "rgba(34,197,94,0.6)" : "rgba(56,189,248,0.6)";
  const globalFont = { fontFamily: "'Helvetica Neue', Arial, sans-serif" };

  // --- Render ---
  return (
    <div className="page" style={{ background: "radial-gradient(circle at center, #0d0f17 0%, #121829 100%)", color: "#fff", textAlign: "center", ...globalFont }}>
      {/* Audio toggle (background music only) */}
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

      {/* Hidden media elements */}
      <audio
        ref={audioElRef}
        src={AUDIO_SRC}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        style={{ display: 'none' }}
      />
      <video ref={noSleepVideoRef} playsInline muted loop preload="auto" style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -9999, top: -9999 }}>
        <source src="data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDFtcDQyaXNvbWF2YzEAAAAIZnJlZQAABG1kYXQAAAAAAA==" type="video/mp4" />
      </video>

      <style>{`
        /* Reset gutters & global typography */
        html, body, #root { margin: 0; padding: 0; height: 100%; background: #0b0f19; }
        :root { --scale: 1; }
        * { box-sizing: border-box; }
        img { display: block; max-width: 100%; }
        body, p, span, div, select, button, footer { font-family: 'Helvetica Neue', Arial, sans-serif; }
        select { font-size: 1rem; }
        .tagline { white-space: nowrap; text-align: center; }
        .header-logo { display: block; margin: 0 auto; filter: brightness(0) invert(1); }

        /* Desktop: one screen, no scroll */
        .page { min-height: 100vh; height: 100svh; display: flex; flex-direction: column; overflow: hidden; }
        .core { flex: 1; width: min(920px, 92vw); margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4vh; padding: 6vh 1rem 0; }
        .core-scale { transform-origin: top center; }
        @media (min-width: 681px) { .core-scale { transform: scale(var(--scale)); } }
        .main-stack { margin-top: 1.25rem; }
        footer { margin-top: auto; }

        /* Mobile: allow scroll if needed */
        @media (max-width: 680px) {
          html, body, #root, .page { height: auto; min-height: 100svh; }
          .page { overflow-x: hidden; overflow-y: auto; }
          .tagline { white-space: normal; margin-top: 1rem; }
          .header-logo { margin-bottom: 0.5rem; margin-top: calc(16px - 4vh) !important; }
          .core { flex: unset; width: min(920px, 92vw); padding: 8vh 1rem 120px; justify-content: flex-start; }
          footer { position: static !important; padding-bottom: 1.5rem; }
        }
      `}</style>

      {/* MAIN CONTENT */}
      <section className="core core-scale" ref={coreRef}>
        <header style={{ textAlign: "center", marginBottom: 0 }}>
          <img src="Zensense_Text_Only.png" alt="ZenSense Logo" className="header-logo" style={{ width: 163, maxWidth: "40vw" }} />
          <p className="tagline" style={{ fontSize: "1rem", opacity: 0.7, marginTop: "1.25rem", letterSpacing: 0.3, maxWidth: 860, width: "92%", marginLeft: "auto", marginRight: "auto" }}>
            Your ultra-minimal focus timer for meditation & productivity.
          </p>
        </header>

        <main className="main-stack" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem" }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={running ? pause : start} style={{ height: "18rem", width: "18rem", borderRadius: "50%", border: `2px solid ${buttonColor}`, color: "#fff", background: "transparent", fontSize: "2rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 40px ${glowColor}` }}>
            {running ? "PAUSE" : hasStarted ? "RESUME" : "START"}
          </motion.button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
            <span>Bell every</span>
            {!hasStarted ? (
              <select value={bellInterval} onChange={(e) => setBellInterval(parseInt(e.target.value))} style={{ background: "transparent", border: "1px solid #64748b", borderRadius: 6, padding: "4px 8px", color: "white", fontSize: "1rem" }}>
                {[2, 5, 10, 15, 20, 30, 45, 60].map((v) => <option key={v} value={v} style={{ color: "black" }}>{v}</option>)}
              </select>
            ) : (
              <div style={{ border: "1px solid #64748b", borderRadius: 6, padding: "4px 12px", opacity: 0.9, fontSize: "1rem" }}>{bellInterval}</div>
            )}
            <span>minutes</span>
          </div>

          <div style={{ minHeight: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", marginTop: "0.5rem" }}>
            <AnimatePresence initial={false}>
              {showTimer && (
                <motion.div key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} style={{ fontSize: "3rem", fontWeight: 700, marginTop: "0.5rem" }} aria-live="polite">{`${mm}:${ss}`}</motion.div>
              )}
              {showTimer && (
                <motion.button key="reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: 0.1 }} onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1.5rem", borderRadius: 10, border: "2px solid rgba(248,113,113,0.8)", background: "transparent", color: "white", fontWeight: 600, fontSize: "0.9rem" }}>RESET</motion.button>
              )}
            </AnimatePresence>
          </div>
        </main>
      </section>

      {/* FOOTER */}
      <footer ref={footerRef} style={{ position: "static", left: 0, right: 0, width: "100%", textAlign: "center", padding: "16px 0", opacity: 0.7, fontSize: 12, background: "transparent" }}>
        No tracking, no sign-in. Just peace.
      </footer>
    </div>
  );
}
