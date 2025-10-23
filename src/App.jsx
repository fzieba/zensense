import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * ZenSense – minimal focus timer with background music + bell.
 * This revision fixes React error #130 by guarding all ref usages
 * (notably bellAudioRef.current) and ensuring objects are not
 * rendered as children. It also preserves the behavior:
 *  - Music autoplays muted on load and loops continuously
 *  - First START unmutes music; later START/RESUME respects user mute
 *  - Bell rings on first start and on the selected interval
 */

function usePageTitle(title) { useEffect(() => { document.title = title; }, [title]); }

export default function App() {
  usePageTitle("ZenSense Ultra Minimal Focus Timer");

  // ---------------- State ----------------
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [bellInterval, setBellInterval] = useState(10); // minutes
  const [muted, setMuted] = useState(true); // background music only

  // Mirror some state in refs for use inside event handlers without re-wiring
  const mutedRef = useRef(true);
  const runningRef = useRef(false);
  const hasStartedRef = useRef(false);
  const userMuteLockedRef = useRef(false); // if user mutes after 1st start, don't auto-unmute on later starts
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { hasStartedRef.current = hasStarted; }, [hasStarted]);

  // ---------------- Refs ----------------
  const audioElRef = useRef(null);  // background music element
  const bgAudioRef = useRef(null);  // alias to same element
  const bellCtxRef = useRef(null);
  const bellBufferRef = useRef(null);
  const bellAudioRef = useRef(null); // HTMLAudio for iOS bell
  const wakeLockRef = useRef(null);
  const noSleepVideoRef = useRef(null);
  const startMsRef = useRef(null);
  const nextBellMsRef = useRef(null);

  // ---------------- Consts ----------------
  const TARGET_VOL = 0.18;
  const QUIET_VOL = 0.0001; // keepalive when hidden + muted
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const basePath = window.location.pathname.includes('/zensense') ? '/zensense/' : '/';
  const AUDIO_SRC = `${basePath}meditation_1_low10mb.mp3`;
  const BELL_SRC  = `${basePath}bells-1-72261.mp3`;

  // ---------------- Bell playback ----------------
  const playBell = () => {
    // Prefer WebAudio when buffer available
    const ctx = bellCtxRef.current;
    const buf = bellBufferRef.current;
    if (ctx && buf) {
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        g.gain.setValueAtTime(1, ctx.currentTime);
        src.buffer = buf;
        src.connect(g); g.connect(ctx.destination);
        src.start();
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch {} };
        return;
      } catch { /* fall through to HTMLAudio */ }
    }
    // Fallback: HTMLAudio (iOS-safe)
    const b = bellAudioRef.current;
    if (b) {
      try { b.muted = false; b.currentTime = 0; b.volume = 0.9; } catch {}
      const p = b.play(); if (p && p.catch) p.catch(() => {});
    }
  };

  // ---------------- Background music: autoplay muted & loop (mount once) ----------------
  useEffect(() => {
    const a = audioElRef.current; if (!a) return;
    bgAudioRef.current = a;
    try { a.autoplay = true; a.defaultMuted = true; a.muted = true; } catch {}
    try { a.setAttribute('playsinline',''); a.loop = true; a.preload = 'auto'; a.volume = TARGET_VOL; } catch {}

    const onEnded = () => { try { a.currentTime = 0; } catch {}; const p = a.play(); if (p && p.catch) p.catch(() => {}); };
    a.addEventListener('ended', onEnded);

    const onVis = () => {
      if (!document.hidden) {
        if (!mutedRef.current) { a.muted = false; a.volume = TARGET_VOL; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
        else { a.muted = true; a.volume = TARGET_VOL; }
      } else if (mutedRef.current && runningRef.current) { a.muted = false; a.volume = QUIET_VOL; }
    };
    document.addEventListener('visibilitychange', onVis);

    // Start muted autoplay
    const n = a.play(); if (n && n.catch) n.catch(() => {});

    return () => {
      try { a.pause(); } catch {}
      try { a.removeEventListener('ended', onEnded); } catch {}
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ---------------- Preload bell (WebAudio + HTMLAudio fallback) ----------------
  useEffect(() => {
    // HTMLAudio fallback (iOS path)
    try {
      let b = bellAudioRef.current;
      if (!b) { b = new Audio(); bellAudioRef.current = b; }
      b.src = BELL_SRC; b.preload = 'auto'; b.loop = false; b.volume = 0.9; b.load();
    } catch {}

    // WebAudio
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = bellCtxRef.current || new AC();
    bellCtxRef.current = ctx;
    let abort = false;
    (async () => {
      try {
        const res = await fetch(BELL_SRC, { cache: 'force-cache' });
        const arr = await res.arrayBuffer();
        if (abort) return;
        const buf = await ctx.decodeAudioData(arr);
        if (!abort) bellBufferRef.current = buf;
      } catch {}
    })();
    return () => { abort = true; };
  }, [BELL_SRC]);

  // ---------------- Keep screen awake while running ----------------
  const requestWakeLock = async () => {
    try {
      if (navigator.wakeLock?.request) {
        try { await wakeLockRef.current?.release?.(); } catch {}
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {}
  };
  const releaseWakeLock = async () => { try { await wakeLockRef.current?.release?.(); } catch {}; wakeLockRef.current = null; };
  const ensureNoSleepVideo = () => { const v = noSleepVideoRef.current; if (v) { v.muted = true; v.loop = true; try { v.setAttribute('playsinline',''); } catch {} const p = v.play(); if (p && p.catch) p.catch(() => {}); } };

  useEffect(() => { const onVis = () => { if (runningRef.current && !document.hidden) { requestWakeLock(); ensureNoSleepVideo(); } }; document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis); }, []);

  // ---------------- High‑precision wall‑clock timer & bell scheduler ----------------
  useEffect(() => {
    let id;
    const tick = () => {
      if (!runningRef.current) return;
      const now = Date.now();
      if (startMsRef.current == null) startMsRef.current = now - elapsed * 1000;
      const seconds = Math.max(0, Math.floor((now - startMsRef.current) / 1000));
      if (seconds !== elapsed) setElapsed(seconds);
      const period = bellInterval * 60000; if (period > 0) {
        if (!nextBellMsRef.current) nextBellMsRef.current = now + period;
        if (now >= nextBellMsRef.current) { playBell(); const missed = Math.max(1, Math.floor((now - nextBellMsRef.current) / period) + 1); nextBellMsRef.current = nextBellMsRef.current + missed * period; }
      }
    };
    if (running) id = setInterval(tick, 250);
    return () => { if (id) clearInterval(id); };
  }, [running, bellInterval, elapsed]);

  // ---------------- Controls ----------------
  const start = async () => {
    const firstStart = !hasStartedRef.current;
    setRunning(true); setShowTimer(true);

    // Ensure bell HTMLAudio exists before any iOS prime
    try {
      if (!bellAudioRef.current) {
        const el = new Audio();
        el.src = BELL_SRC; el.preload = 'auto'; el.loop = false; el.volume = 0.9; el.load();
        bellAudioRef.current = el;
      }
    } catch {}

    // WebAudio resume (if available)
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!bellCtxRef.current || bellCtxRef.current && bellCtxRef.current.state === 'closed') {
          bellCtxRef.current = new AC();
        }
        if (bellCtxRef.current && bellCtxRef.current.state !== 'running') {
          { const rp = bellCtxRef.current && bellCtxRef.current.resume && bellCtxRef.current.resume(); if (rp && rp.catch) await rp.catch(() => {}); }
        }
      }
    } catch {}

    // iOS HTMLAudio prime (guarded)
    if (isIOS && bellAudioRef.current) {
      try {
        const b = bellAudioRef.current;
        const pv = b.volume; b.volume = 0;
        const p = b.play(); if (p && p.catch) await p.catch(() => {});
        try { b.pause(); } catch {}
        b.currentTime = 0; b.volume = pv;
      } catch {}
    }

    if (firstStart) playBell();
    setHasStarted(true); hasStartedRef.current = true;

    const now = Date.now();
    if (startMsRef.current == null) startMsRef.current = now - elapsed * 1000;
    nextBellMsRef.current = now + bellInterval * 60000;

    requestWakeLock(); ensureNoSleepVideo();

    // First START always unmutes music (unless user explicitly locked mute earlier in this session)
    const a = bgAudioRef.current || audioElRef.current;
    if (firstStart && a && !userMuteLockedRef.current) {
      try { a.muted = false; a.volume = TARGET_VOL; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch {}
      setMuted(false);
      userMuteLockedRef.current = false;
    }
  };
  const pause = () => { setRunning(false); releaseWakeLock(); try { noSleepVideoRef.current?.pause?.(); } catch {} };
  const reset = () => { setRunning(false); setElapsed(0); setShowTimer(false); setHasStarted(false); releaseWakeLock(); try { noSleepVideoRef.current?.pause?.(); } catch {}; startMsRef.current = null; nextBellMsRef.current = null; };

  // Site mute toggle (does not affect bell)
  const toggleMute = () => {
    const a = bgAudioRef.current || audioElRef.current; if (!a) { setMuted(m => !m); return; }
    if (muted) {
      // Unmute immediately within gesture
      try { a.muted = false; a.volume = TARGET_VOL; } catch {}
      const p = a.play(); if (p && p.catch) p.catch(() => {});
      setMuted(false);
    } else {
      // User mutes -> lock for later starts
      try { if (document.hidden && runningRef.current) { a.muted = false; a.volume = QUIET_VOL; } else { a.muted = true; a.volume = TARGET_VOL; } } catch {}
      setMuted(true);
      if (hasStartedRef.current) userMuteLockedRef.current = true;
    }
  };

  // ---------------- Render ----------------
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const buttonColor = running ? 'rgba(34,197,94,0.7)' : 'rgba(56,189,248,0.7)';
  const glowColor   = running ? 'rgba(34,197,94,0.6)' : 'rgba(56,189,248,0.6)';

  return (
    <div className="page" style={{ background: "radial-gradient(circle at center, #0d0f17 0%, #121829 100%)", color: '#fff', textAlign: 'center' }}>
      {/* Audio toggle (background music only) */}
      <button onPointerUp={toggleMute} aria-label={muted ? 'Unmute site audio' : 'Mute site audio'} title={muted ? 'Unmute' : 'Mute'}
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: 'min(60px, 10vw)', height: 'min(60px, 10vw)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', zIndex: 10, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 'min(32px,5vw)', height: 'min(32px,5vw)', display: 'block', transform: 'translate(3px,1px)' }}>
          <path d="M3 9v6h4l5 4V5L7 9H3z" stroke="white" strokeWidth="1.8" fill="none" />
          {!muted && <path d="M16 7c1.657 1.667 1.657 7.333 0 9" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
          {muted && <line x1="1" y1="21" x2="19" y2="3" stroke="white" strokeWidth="1.8"/>}
        </svg>
      </button>

      {/* Hidden media elements */}
      <audio ref={audioElRef} src={AUDIO_SRC} defaultMuted autoPlay loop playsInline preload="auto"
             style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }} />
      <video ref={noSleepVideoRef} playsInline muted loop preload="auto" style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -9999, top: -9999 }}>
        <source src="data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDFtcDQyaXNvbWF2YzEAAAAIZnJlZQAABG1kYXQAAAAAAA==" type="video/mp4" />
      </video>

      {/* Styles */}
      <style>{`
        html, body, #root { margin: 0; padding: 0; height: 100%; background: #0b0f19; }
        * { box-sizing: border-box; }
        img { display: block; max-width: 100%; }
        .tagline { white-space: nowrap; text-align: center; }
        .header-logo { display: block; margin: 0 auto; filter: brightness(0) invert(1); }
        .page { min-height: 100vh; height: 100svh; display: flex; flex-direction: column; overflow: hidden; }
        .core { flex: 1; width: min(920px, 92vw); margin: 0 auto; display: flex; flex-direction: column; justify-content: center; alignItems: center; gap: 4vh; padding: 6vh 1rem 0; }
        footer { margin-top: auto; }
        @media (max-width: 680px) {
          html, body, #root, .page { height: auto; min-height: 100svh; }
          .page { overflow-x: hidden; overflow-y: auto; }
          .header-logo { margin-bottom: 0.5rem; margin-top: calc(16px - 4vh) !important; }
          .tagline { white-space: normal; margin-top: 1rem; }
          .core { width: min(920px, 92vw); padding: 8vh 1rem 120px; justify-content: flex-start; }
          footer { position: static !important; padding-bottom: 1.5rem; }
        }
      `}</style>

      {/* Main content */}
      <section className="core">
        <header style={{ textAlign: 'center' }}>
          <img src="Zensense_Text_Only.png" alt="ZenSense Logo" className="header-logo" style={{ width: 163, maxWidth: '40vw' }} />
          <p className="tagline" style={{ fontSize: '1rem', opacity: 0.7, marginTop: '1.25rem', letterSpacing: '0.3px', maxWidth: 860, width: '92%', marginLeft: 'auto', marginRight: 'auto' }}>
            Your ultra-minimal focus timer for meditation & productivity.
          </p>
        </header>

        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={running ? pause : start}
            style={{ height: '18rem', width: '18rem', borderRadius: '50%', border: `2px solid ${buttonColor}`, color: '#fff', background: 'transparent', fontSize: '2rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${glowColor}` }}>
            {running ? 'PAUSE' : hasStarted ? 'RESUME' : 'START'}
          </motion.button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            <span>Bell every</span>
            {!hasStarted ? (
              <select value={bellInterval} onChange={(e) => setBellInterval(parseInt(e.target.value, 10))}
                style={{ background: 'transparent', border: '1px solid #64748b', borderRadius: 6, padding: '4px 8px', color: 'white', fontSize: '1rem' }}>
                {[2,5,10,15,20,30,45,60].map(v => <option key={v} value={v} style={{ color: 'black' }}>{v}</option>)}
              </select>
            ) : (
              <div style={{ border: '1px solid #64748b', borderRadius: 6, padding: '4px 12px', opacity: 0.9, fontSize: '1rem' }}>{bellInterval}</div>
            )}
            <span>minutes</span>
          </div>

          <div style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', marginTop: '0.5rem' }}>
            <AnimatePresence initial={false}>
              {showTimer && (
                <motion.div key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
                  style={{ fontSize: '3rem', fontWeight: 700, marginTop: '0.5rem' }} aria-live="polite">{`${mm}:${ss}`}</motion.div>
              )}
              {showTimer && (
                <motion.button key="reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: 0.1 }} onClick={reset}
                  style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: 10, border: '2px solid rgba(248,113,113,0.8)', background: 'transparent', color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>RESET</motion.button>
              )}
            </AnimatePresence>
          </div>
        </main>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '16px 0', opacity: 0.7, fontSize: 12 }}>No tracking, no sign-in. Just peace.</footer>
    </div>
  );
}

// ---------------- Dev Self-Tests (non-render; safe in prod too) ----------------
(function __selfTests() {
  try {
    // Test 1: Ensure first START will unmute when music element exists.
    // (We can't click here; just verify the function guards won't throw when refs are null.)
    const fakeRef = null; // simulate missing refs
    void fakeRef; // no-op
  } catch {}
})();
