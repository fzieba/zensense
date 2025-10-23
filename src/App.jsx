// Fixed syntax errors in setMutedState and toggleMute
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function App() {
  const [muted, setMuted] = useState(true);
  const [running, setRunning] = useState(false);
  const bgAudioRef = useRef(null);
  const audioElRef = useRef(null);
  const TARGET_VOL = 0.18;
  const QUIET_VOL = 0.0001;

  const setMutedState = (next) => {
    setMuted(next);
    const a = bgAudioRef.current || audioElRef.current;
    if (!a) return;
    try {
      if (!next) {
        a.muted = false;
        a.removeAttribute('muted');
        a.volume = TARGET_VOL;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        if (document.hidden && running) {
          a.muted = false;
          a.volume = QUIET_VOL;
        } else {
          a.volume = TARGET_VOL;
          a.muted = true;
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleMute = () => {
    const a = bgAudioRef.current || audioElRef.current;
    if (a) {
      try {
        if (muted) {
          a.muted = false;
          a.removeAttribute('muted');
          a.volume = TARGET_VOL;
          const p = a.play();
          if (p && p.catch) p.catch(() => {});
        } else {
          if (document.hidden && running) {
            a.muted = false;
            a.volume = QUIET_VOL;
          } else {
            a.volume = TARGET_VOL;
            a.muted = true;
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    setMuted(!muted);
  };

  return (
    <div style={{ textAlign: "center", color: "white" }}>
      <h1>ZenSense Audio Debug</h1>
      <button onClick={toggleMute}>
        {muted ? "Unmute" : "Mute"}
      </button>
      <audio
        ref={audioElRef}
        src="meditation_1_low10mb.mp3"
        defaultMuted
        autoPlay
        loop
        playsInline
        preload="auto"
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
      />
    </div>
  );
}
