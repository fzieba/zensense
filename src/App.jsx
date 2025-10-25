import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ---- Small helpers ----
function usePageTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}

export default function App() {
  usePageTitle("ZenSense Ultra Minimal Focus Timer");

  // ---- State ----
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [bellInterval, setBellInterval] = useState(10); // minutes
  const [muted, setMuted] = useState(true); // background music only

  // ---- Refs (mirrors to avoid re-wiring listeners) ----
  const mutedRef = useRef(true);
  const runningRef = useRef(false);
  const hasStartedRef = useRef(false);
  const userMuteLockedRef = useRef(false); // if user mutes after first start, don't auto‑unmute later

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { hasStartedRef.current = hasStarted; }, [hasStarted]);

  // ---- DOM/Audio refs ----
  const audioElRef = useRef(null);        // background music <audio>
  const bellAudioRef = useRef(null);      // HTMLAudio bell fallback (iOS safe)
  const bellCtxRef = useRef(null);        // WebAudio for bell (desktop/Android)
  const bellBufferRef = useRef(null);
  const wakeLockRef = useRef(null);
  const noSleepVideoRef = useRef(null);
  const anchorMsRef = useRef(null);      // when running, Date.now() anchor
  const offsetMsRef = useRef(0);         // accumulated ms across runs/pauses
  const lastBellCountRef = useRef(0);    // how many bells have fired based on elapsed time     // next bell wall‑clock time

  // --- Mobile dim mode (optional) ---
  const [dimActive, setDimActive] = useState(false);
  const dimTimerRef = useRef(null);

  // ---- Constants ----
  const TARGET_VOL = 0.18;
  const QUIET_VOL = 0.0001;               // keep‑alive when hidden + muted
  const isIOS = (typeof navigator !== 'undefined') && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const basePath = window.location.pathname.includes('/zensense') ? '/zensense/' : '/';
  const AUDIO_SRC = `${basePath}meditation_1_low10mb.mp3`;
  const BELL_SRC  = `${basePath}bells-1-72261.mp3`;

  // ---- Bell playback (never muted) ----
  const playBell = () => {
    // On iOS, HTMLAudio path is the most reliable. Else prefer WebAudio.
    if (isIOS && bellAudioRef.current) {
      const b = bellAudioRef.current;
      try { b.muted = false; b.volume = 1; b.currentTime = 0; } catch {}
      const p = b.play(); if (p && p.catch) p.catch(() => {});
      return;
    }
    // WebAudio first for non‑iOS
    const ctx = bellCtxRef.current;
    const buf = bellBufferRef.current;
    if (ctx && buf) {
      try {
        if (ctx.state !== 'running') { ctx.resume().catch(() => {}); }
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        g.gain.setValueAtTime(1, ctx.currentTime);
        src.buffer = buf;
        src.connect(g); g.connect(ctx.destination);
        src.start();
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch {} };
        return;
      } catch {}
    }
    // Fallback: HTMLAudio element (ensure not muted)
    const b = bellAudioRef.current;
    if (b) {
      try { b.muted = false; b.volume = 1; b.currentTime = 0; } catch {}
      const p = b.play(); if (p && p.catch) p.catch(() => {});
      return;
    }
    // Last chance: ephemeral element
    try {
      const ep = new Audio(BELL_SRC);
      ep.preload = 'auto'; ep.loop = false; ep.volume = 1; ep.muted = false;
      const p = ep.play(); if (p && p.catch) p.catch(() => {});
    } catch {}
  };

  // ---- Background music element: autoplay muted & loop (mount once) ----
  useEffect(() => {
    const a = audioElRef.current; if (!a) return;
    try { a.autoplay = true; a.defaultMuted = true; a.muted = true; } catch {}
    try { a.loop = true; a.preload = 'auto'; a.volume = TARGET_VOL; a.setAttribute('playsinline',''); } catch {}

    const onEnded = () => { try { a.currentTime = 0; } catch {}; const p = a.play(); if (p && p.catch) p.catch(() => {}); };
    a.addEventListener('ended', onEnded);

    const onVis = () => {
      if (!document.hidden) {
        if (!mutedRef.current) { a.muted = false; a.volume = TARGET_VOL; const p = a.play(); if (p && p.catch) p.catch(() => {}); }
        else { a.muted = true; a.volume = TARGET_VOL; }
      } else if (mutedRef.current && runningRef.current) {
        // Keep tiny volume while hidden to prevent some platforms from fully suspending the pipeline
        a.muted = false; a.volume = QUIET_VOL;
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // Kick autoplay (muted)
    const n = a.play(); if (n && n.catch) n.catch(() => {});

    return () => {
      try { a.pause(); } catch {}
      try { a.removeEventListener('ended', onEnded); } catch {}
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ---- Preload bell (HTMLAudio + WebAudio buffer) ----
  useEffect(() => {
    // Ensure the bell <audio> element is wired with source and ready
    try {
      const b = bellAudioRef.current; if (b) { b.src = BELL_SRC; b.preload = 'auto'; b.loop = false; b.volume = 1; b.load(); }
    } catch {}

    // WebAudio
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = bellCtxRef.current || new AC(); bellCtxRef.current = ctx;
    let abort = false;
    (async () => {
      try {
        const res = await fetch(BELL_SRC, { cache: 'force-cache' });
        const arr = await res.arrayBuffer(); if (abort) return;
        // Safari compatibility: support callback and promise forms
        const decoded = await new Promise((resolve, reject) => {
          let settled = false;
          ctx.decodeAudioData(arr, (buf) => { if (!settled) { settled = true; resolve(buf); } }, (e) => { if (!settled) { settled = true; reject(e); } });
          setTimeout(async () => { if (!settled && ctx.decodeAudioData.length === 1) { try { const buf = await ctx.decodeAudioData(arr); settled = true; resolve(buf); } catch (e) { settled = true; reject(e); } } }, 0);
        });
        if (!abort) bellBufferRef.current = decoded;
      } catch {}
    })();
    return () => { abort = true; };
  }, [BELL_SRC]);

  // ---- Timer & bell scheduler (wall‑clock anchored but pause‑aware) ----
  useEffect(() => {
    let id;
    const tick = () => {
      if (!runningRef.current) return;
      const now = Date.now();
      if (anchorMsRef.current == null) anchorMsRef.current = now; // safety
      const elapsedMs = offsetMsRef.current + (now - anchorMsRef.current);
      const secs = Math.max(0, Math.floor(elapsedMs / 1000));
      if (secs !== elapsed) setElapsed(secs);

      // Bell scheduling based on elapsed timer time (respects pause).
      const period = bellInterval * 60000; // ms
      if (period > 0) {
        const countNow = Math.floor(elapsedMs / period);
        if (countNow > lastBellCountRef.current) {
          // Proactively resume context each time to avoid long‑idle suspension on some mobile browsers
          try { bellCtxRef.current && bellCtxRef.current.resume && bellCtxRef.current.resume(); } catch {}
          playBell();
          lastBellCountRef.current = countNow;
        }
      }
    };
    if (running) id = setInterval(tick, 250);
    return () => { if (id) clearInterval(id); };
  }, [running, bellInterval, elapsed]);

  // ---- Keep screen awake while running & tab visible ----
  const requestWakeLock = async () => {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        try { await wakeLockRef.current?.release?.(); } catch {}
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* ignore */ }
  };
  const releaseWakeLock = async () => {
    try { await wakeLockRef.current?.release?.(); } catch {}
    wakeLockRef.current = null;
  };
  const ensureNoSleepVideo = () => {
    const v = noSleepVideoRef.current; if (!v) return;
    try { v.muted = true; v.loop = true; v.setAttribute('playsinline',''); } catch {}
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  };

  useEffect(() => {
    const isMobile = () => window.matchMedia && window.matchMedia('(max-width: 680px)').matches;

    const syncWake = () => {
      if (document.visibilityState === 'visible' && runningRef.current) {
        requestWakeLock();
        ensureNoSleepVideo();
        if (isMobile()) setDimActive(true);
      } else {
        releaseWakeLock();
        try { noSleepVideoRef.current?.pause?.(); } catch {}
        setDimActive(false);
      }
    };

    const nudgeUndim = () => {
      // Any interaction temporarily undims; re-dim after 15s if still eligible
      if (dimActive) setDimActive(false);
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
      dimTimerRef.current = setTimeout(() => {
        const mobile = window.matchMedia && window.matchMedia('(max-width: 680px)').matches;
        if (document.visibilityState === 'visible' && runningRef.current && mobile) {
          setDimActive(true);
        }
      }, 15000);
    };

    document.addEventListener('visibilitychange', syncWake);
    window.addEventListener('pointerdown', nudgeUndim, { passive: true });
    window.addEventListener('keydown', nudgeUndim);
    syncWake();
    return () => {
      document.removeEventListener('visibilitychange', syncWake);
      window.removeEventListener('pointerdown', nudgeUndim);
      window.removeEventListener('keydown', nudgeUndim);
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    };
  }, [dimActive]);

  // ---- Controls ----
  const start = async () => {
    const firstStart = !hasStartedRef.current;
    // set anchors for pause-aware timing
    const now = Date.now();
    if (!runningRef.current) {
      if (anchorMsRef.current == null) anchorMsRef.current = now;
    }
    setRunning(true); runningRef.current = true;
    setShowTimer(true); setHasStarted(true); hasStartedRef.current = true;

    // (Re)unlock audio each start/resume — some browsers suspend after long idle
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!bellCtxRef.current || bellCtxRef.current.state === 'closed') bellCtxRef.current = new AC();
        if (bellCtxRef.current.state !== 'running') await bellCtxRef.current.resume().catch(() => {});
      }
    } catch {}

    if (firstStart) {
      lastBellCountRef.current = 0; // reset bell counter for new session
      // Prime both audio systems inside the user gesture
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          if (!bellCtxRef.current || bellCtxRef.current.state === 'closed') bellCtxRef.current = new AC();
          if (bellCtxRef.current.state !== 'running') await bellCtxRef.current.resume().catch(() => {});
        }
      } catch {}
      if (isIOS && bellAudioRef.current) {
        try {
          const b = bellAudioRef.current; const pv = b.volume;
          b.volume = 0; const p = b.play(); if (p && p.catch) await p.catch(() => {});
          try { b.pause(); } catch {} b.currentTime = 0; b.volume = pv;
        } catch {}
      }
      playBell();
    }

    // First START always unmutes music unless user muted after starting
    const a = audioElRef.current;
    if (firstStart && a && !userMuteLockedRef.current) {
      try { a.muted = false; a.volume = TARGET_VOL; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch {}
      setMuted(false);
      userMuteLockedRef.current = false;
    }

    // Keep screen awake while running & visible
    requestWakeLock();
    ensureNoSleepVideo();
  };

  const pause = () => {
    if (!runningRef.current) return;
    const now = Date.now();
    if (anchorMsRef.current != null) {
      offsetMsRef.current += (now - anchorMsRef.current);
      anchorMsRef.current = null; // clear anchor while paused
    }
    setRunning(false); runningRef.current = false;
    // release wake and pause helper video
    releaseWakeLock();
    try { noSleepVideoRef.current?.pause?.(); } catch {}
  };

  const reset = () => {
    setRunning(false); runningRef.current = false;
    setElapsed(0); setShowTimer(false); setHasStarted(false); hasStartedRef.current = false;
    // clear timing
    anchorMsRef.current = null; offsetMsRef.current = 0; lastBellCountRef.current = 0;
    // release wake and pause helper video
    releaseWakeLock();
    try { noSleepVideoRef.current?.pause?.(); } catch {}
  };

  const toggleMute = () => {
    const a = audioElRef.current; if (!a) { setMuted(m => !m); return; }
    if (muted) {
      try { a.muted = false; a.volume = TARGET_VOL; } catch {}
      const p = a.play(); if (p && p.catch) p.catch(() => {});
      setMuted(false);
    } else {
      try { a.muted = true; a.volume = TARGET_VOL; } catch {}
      setMuted(true);
      if (hasStartedRef.current) userMuteLockedRef.current = true;
    }
  };

  // ---- Derived display ----
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const timeText = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const buttonLabel = running ? 'PAUSE' : hasStarted ? 'RESUME' : 'START';
  const buttonAction = running ? pause : start;
  const buttonColor = running ? 'rgba(34,197,94,0.7)' : 'rgba(56,189,248,0.7)';
  const glowColor   = running ? 'rgba(34,197,94,0.6)' : 'rgba(56,189,248,0.6)';

  return (
    <div className="page" style={{ background: "radial-gradient(circle at center, #0d0f17 0%, #121829 100%)", color: '#fff', textAlign: 'center' }}>
      {/* Audio toggle (background music only) */}
      <button onPointerUp={toggleMute} aria-label={muted ? 'Unmute site audio' : 'Mute site audio'} title={muted ? 'Unmute' : 'Mute'}
        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: 'min(56px, 10vw)', height: 'min(56px, 10vw)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 'min(30px,5vw)', height: 'min(30px,5vw)' }}>
          <path d="M3 9v6h4l5 4V5L7 9H3z" stroke="white" strokeWidth="1.8" fill="none" />
          {!muted && <path d="M16 7c1.657 1.667 1.657 7.333 0 9" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
          {muted && <line x1="1" y1="21" x2="19" y2="3" stroke="white" strokeWidth="1.8"/>}
        </svg>
      </button>

      {/* Hidden media elements */}
      <audio ref={audioElRef} src={AUDIO_SRC} defaultMuted autoPlay loop playsInline preload="auto"
             style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }} />
      <audio ref={bellAudioRef} src={BELL_SRC} preload="auto"
             style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }} />

      {/* Layout styles */}
      <style>{`
        html, body, #root { margin: 0; padding: 0; height: 100%; background: #0b0f19; }
        * { box-sizing: border-box; }
        img { display: block; max-width: 100%; }
        body, p, span, div, select, button, footer { font-family: 'Helvetica Neue', Arial, sans-serif; }
        .page { min-height: 100vh; height: 100svh; display: flex; flex-direction: column; position: relative; }
        .core { flex: 1; width: min(920px, 92vw); margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4vh; padding: 6vh 1rem 0; }
        footer { margin-top: auto; text-align: center; padding: 16px 0; opacity: 0.7; font-size: 12px; }
        /* Dim overlay + toggle */
        .dim-toggle { display: none; }
        .dim-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); pointer-events: none; transition: opacity 200ms ease; }
        @media (max-width: 680px) {
          html, body, #root, .page { height: auto; min-height: 100svh; }
          .page { overflow-x: hidden; overflow-y: auto; }
          .core { padding: 8vh 1rem 120px; justify-content: flex-start; }
          .dim-toggle { display: block; }
        }
      `}</style>

      {/* Main content */}
      <section className="core">
        <header style={{ textAlign: 'center' }}>
          <img src="Zensense_Text_Only.png" alt="ZenSense Logo" style={{ width: 163, maxWidth: '40vw', margin: '0 auto', filter: 'brightness(0) invert(1)' }} />
          <p style={{ fontSize: '1rem', opacity: 0.7, marginTop: '1.25rem', letterSpacing: '0.3px', display: 'inline-block', maxWidth: '92vw', marginLeft: 'auto', marginRight: 'auto' }}>
            Your ultra-minimal focus timer for meditation & productivity.
          </p>
        </header>

        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={buttonAction}
            style={{ height: '18rem', width: '18rem', borderRadius: '50%', border: `2px solid ${buttonColor}`, color: '#fff', background: 'transparent', fontSize: '2rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${glowColor}` }}>
            {buttonLabel}
          </motion.button>

          {/* Bell interval control */}
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

          {/* Timer + Reset */}
          <div style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', marginTop: '0.5rem' }}>
            <AnimatePresence initial={false}>
              {showTimer && (
                <motion.div key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
                  style={{ fontSize: '3.4rem', fontWeight: 700, marginTop: '0.5rem' }} aria-live="polite">{timeText}</motion.div>
              )}
              {showTimer && (
                <motion.button key="reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, delay: 0.1 }} onClick={reset}
                  style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: 10, border: '2px solid rgba(248,113,113,0.8)', background: 'transparent', color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>RESET</motion.button>
              )}
            </AnimatePresence>
          </div>
        </main>
        {/* Mobile dim setting (shown only on small screens) */}
        
      </section>

      {/* Footer */}
      <footer>No tracking, no sign-in. Just peace.</footer>

      {/* Hidden tiny video to keep iOS awake once user interacts via START (we don't auto-play it) */}
      {dimActive && <div className="dim-overlay" />}
      {/* Hidden tiny video to keep iOS awake once user interacts via START (we don't auto-play it) */}
      <video id="nosleep" ref={noSleepVideoRef} playsInline muted loop preload="auto" style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -9999, top: -9999 }} />
    </div>
  );
}
