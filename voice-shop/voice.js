// Speech in and speech out, in Hindi.
//
// ASR engines: browser (Web Speech API, hi-IN), sarvam (saaras), openai (gpt-4o-transcribe / whisper).
// TTS engines: browser (speechSynthesis, hi-IN voice), sarvam (bulbul), openai (gpt-4o-mini-tts).
// The cloud engines record with MediaRecorder and stop on silence, so every
// engine behaves the same from the app's point of view: listen() resolves with
// the final transcript and reports interim text along the way.
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ---------------- ASR ----------------
  // Join text heard before a handover with what came after, dropping words both caught.
  function joinHeard(a, b) {
    const A = String(a || "").trim().split(/\s+/).filter(Boolean), B = String(b || "").trim().split(/\s+/).filter(Boolean);
    for (let k = Math.min(A.length, B.length); k > 0; k--) {
      if (A.slice(-k).join(" ") === B.slice(0, k).join(" ")) return A.concat(B.slice(k)).join(" ");
    }
    return A.concat(B).join(" ");
  }

  // Continuous recognition with our own end-of-turn detection: a normal pause
  // ends the turn after ~1s, but if the user trails off on "और…", "मतलब…" or
  // "उम्म" we wait longer, the way a person waits for you to finish a thought.
  // Patient mode (after "सोचने दो") keeps the mic open for a long time.
  function browserListen(cfg, opts) {
    const { onInterim, onSpeechStart, patient, prefix } = opts || {};
    return new Promise((resolve, reject) => {
      if (!SR) return reject(new Error("इस ब्राउज़र में आवाज़ पहचान नहीं है। Chrome इस्तेमाल करें या सेटिंग में Sarvam/OpenAI ASR चुनें।"));
      const t0 = performance.now();
      const noSpeechLimit = patient ? 45000 : 8000;
      let carry = prefix ? prefix.trim() : "";   // text from earlier recognizer sessions
      let current = "", started = !!prefix, done = false, timer = null, rec = null;
      const full = () => joinHeard(carry, current);
      const finish = (txt) => {
        if (done) return; done = true; clearTimeout(timer);
        try { rec && rec.abort(); } catch (e) {}
        resolve(txt);
      };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(full()), (window.Dynamics ? Dynamics.endpointDelay(full()) : 1000));
      };
      const begin = () => {
        rec = new SR();
        rec.lang = "hi-IN"; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          let txt = "";
          for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + " ";
          current = txt;
          if (!started && full()) { started = true; onSpeechStart && onSpeechStart(performance.now() - t0); }
          onInterim && onInterim(full());
          arm();
        };
        rec.onerror = (e) => {
          if (e.error === "no-speech" || e.error === "aborted") return;
          if (done) return;
          done = true; clearTimeout(timer);
          reject(new Error(e.error === "not-allowed" ? "माइक की अनुमति नहीं मिली। ब्राउज़र में माइक की अनुमति दें।" : "ASR त्रुटि: " + e.error));
        };
        rec.onend = () => {
          if (done) return;
          carry = full(); current = "";
          // Chrome ends sessions on its own after a while. Keep going until our own rules say stop.
          if (started) { if (!timer) arm(); setTimeout(() => { if (!done) begin(); }, 60); }
          else if (performance.now() - t0 < noSpeechLimit) setTimeout(() => { if (!done) begin(); }, 60);
          else finish("");
        };
        try { rec.start(); } catch (e) { finish(full()); }
      };
      Voice._stopRec = () => finish(full());
      Voice._abortRec = () => finish("");
      setTimeout(() => { if (!started) finish(""); }, noSpeechLimit);
      begin();
    });
  }

  // Listens while Vaani is speaking (duplex). Reports every result so the app
  // can tell a nod ("हम्म") from "रुको" from the user taking over.
  function monitor(onText) {
    if (!SR) return { stop() {} };
    let stopped = false, rec, sess = 0;
    const begin = () => {
      const my = ++sess;
      rec = new SR();
      rec.lang = "hi-IN"; rec.interimResults = true; rec.continuous = true;
      rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) onText(my + ":" + i, e.results[i][0].transcript, e.results[i].isFinal); };
      rec.onerror = () => {};
      rec.onend = () => { if (!stopped) setTimeout(() => !stopped && begin(), 80); };
      try { rec.start(); } catch (e) {}
    };
    begin();
    return { stop() { stopped = true; try { rec.abort(); } catch (e) {} } };
  }

  // Record until the speaker goes quiet, then hand back a Blob.
  async function recordUtterance(onLevel, noSpeechMs) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let spoke = false, lastLoud = performance.now();
    const start = performance.now();
    return new Promise((resolve) => {
      let stopped = false;
      const stop = (discard) => {
        if (stopped) return; stopped = true;
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          ctx.close();
          resolve(discard || !spoke ? null : new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      };
      Voice._stopRec = () => { spoke = true; stop(false); };
      Voice._abortRec = () => stop(true);
      rec.start(250);
      const tick = () => {
        if (stopped) return;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        onLevel && onLevel(rms);
        const now = performance.now();
        if (rms > 0.035) { spoke = true; lastLoud = now; }
        if (spoke && !onLevel.firstSpeech) { onLevel.firstSpeech = true; onLevel.onSpeechStart && onLevel.onSpeechStart(now - start); }
        if (spoke && now - lastLoud > 1300) return stop(false);
        if (!spoke && now - start > (noSpeechMs || 7000)) return stop(true);
        if (now - start > 20000) return stop(false);
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function sarvamTranscribe(blob, cfg) {
    const fd = new FormData();
    fd.append("file", blob, "speech." + (blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"));
    fd.append("model", cfg.asrModel || "saaras:v4");
    fd.append("language_code", "hi-IN");
    const r = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": cfg.sarvamKey }, body: fd });
    if (!r.ok) throw new Error("Sarvam ASR " + r.status + ": " + (await r.text()).slice(0, 200));
    return ((await r.json()).transcript || "").trim();
  }

  async function openaiTranscribe(blob, cfg) {
    const fd = new FormData();
    fd.append("file", blob, "speech." + (blob.type.includes("mp4") ? "m4a" : "webm"));
    fd.append("model", cfg.asrModel || "gpt-4o-transcribe");
    fd.append("language", "hi");
    fd.append("prompt", "यह एक शॉपिंग ऐप पर हिंदी बातचीत है: साड़ी, कुर्ती, कार्ट, ऑर्डर, पता, पिनकोड, UPI।");
    const base = (cfg.openaiAudioBase || "https://api.openai.com/v1").replace(/\/$/, "");
    const r = await fetch(base + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + cfg.openaiAudioKey }, body: fd });
    if (!r.ok) throw new Error("OpenAI ASR " + r.status + ": " + (await r.text()).slice(0, 200));
    return ((await r.json()).text || "").trim();
  }

  async function cloudOnce(cfg, opts, noSpeechMs) {
    const lv = (r) => opts.onLevel && opts.onLevel(r);
    lv.onSpeechStart = opts.onSpeechStart;
    const blob = await recordUtterance(lv, noSpeechMs);
    if (!blob) return "";
    opts.onInterim && opts.onInterim(((opts.prefix || "") + " …").trim());
    if (cfg.asr === "sarvam") return sarvamTranscribe(blob, cfg);
    if (cfg.asr === "openai") return openaiTranscribe(blob, cfg);
    throw new Error("अज्ञात ASR: " + cfg.asr);
  }

  async function listen(cfg, opts = {}) {
    if (cfg.asr === "browser" || !cfg.asr) return browserListen(cfg, opts);
    // Cloud engines stop on silence; if the user trailed off mid-thought, keep listening and join the pieces.
    let text = joinHeard(opts.prefix, await cloudOnce(cfg, opts, opts.patient ? 45000 : 7000));
    for (let i = 0; i < 2 && text && window.Dynamics && Dynamics.trailsOff(text); i++) {
      opts.onInterim && opts.onInterim(text + " …");
      const more = await cloudOnce(cfg, Object.assign({}, opts, { onSpeechStart: null, prefix: text }), 4000);
      if (!more) break;
      text = joinHeard(text, more);
    }
    opts.onInterim && opts.onInterim(text);
    return text;
  }

  // ---------------- TTS ----------------
  // Text written for the screen isn't always what should be spoken.
  function speakable(t) {
    return String(t)
      .replace(/\*\*|__|`|#+\s?/g, "")
      .replace(/₹\s?([\d,]+)/g, (m, n) => n.replace(/,/g, "") + " रुपये")
      .replace(/(\d)\s?%/g, "$1 प्रतिशत")
      .replace(/★|⭐/g, " स्टार")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  let hiVoice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices();
    hiVoice = vs.find((v) => /hi[-_]IN/i.test(v.lang) && /google/i.test(v.name))
      || vs.find((v) => /hi[-_]IN/i.test(v.lang) && /female|swara|kalpana|lekha/i.test(v.name))
      || vs.find((v) => /^hi/i.test(v.lang)) || null;
    return hiVoice;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

  function b64ToBlob(b64, type) {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }

  async function sarvamSynth(text, cfg) {
    const r = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": cfg.sarvamKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, language_code: "hi-IN", model: cfg.ttsModel || "bulbul:v3", speaker: cfg.ttsVoice || "priya", pace: Number(cfg.rate) || 1, speech_sample_rate: 24000 }),
    });
    if (!r.ok) throw new Error("Sarvam TTS " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    return b64ToBlob(j.audios[0], "audio/wav");
  }

  async function openaiSynth(text, cfg) {
    const base = (cfg.openaiAudioBase || "https://api.openai.com/v1").replace(/\/$/, "");
    const r = await fetch(base + "/audio/speech", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.openaiAudioKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.ttsModel || "gpt-4o-mini-tts", voice: cfg.ttsVoice || "coral", input: text, response_format: "mp3", speed: Number(cfg.rate) || 1,
        instructions: "गर्मजोशी भरी, दोस्ताना, स्वाभाविक भारतीय हिंदी में बोलें, जैसे कोई मददगार दुकानदार दीदी बात कर रही हो।" }),
    });
    if (!r.ok) throw new Error("OpenAI TTS " + r.status + ": " + (await r.text()).slice(0, 200));
    return await r.blob();
  }

  // A sentence queue. Cloud audio for sentence N+1 is fetched while sentence N
  // plays, so streamed LLM text turns into near-continuous speech.
  class Speaker {
    constructor() {
      this.queue = []; this.playing = false; this.gen = 0; this.audio = new Audio();
      this.onState = () => {}; this.onError = () => {}; this.onStart = () => {};
      this.cache = new Map();   // cloud audio for short reflex lines, so "हम्म…" plays instantly
      this.heardLog = [];       // reply sentences the user actually heard (started playing)
      this.current = null;
    }
    get busy() { return this.playing || this.queue.length > 0; }
    get speakingReply() { return !!(this.current && this.current.kind === "reply"); }
    _synth(text, cfg, cacheable) {
      const key = cfg.tts + "|" + (cfg.ttsVoice || "") + "|" + (cfg.ttsModel || "") + "|" + (cfg.rate || 1) + "|" + text;
      if (cacheable && this.cache.has(key)) return this.cache.get(key);
      const p = (cfg.tts === "sarvam" ? sarvamSynth : openaiSynth)(text, cfg).catch((e) => { this.onError(e); this.cache.delete(key); return null; });
      if (cacheable) this.cache.set(key, p);
      return p;
    }
    // Fetch cloud audio for the reflex lines in the background, two at a time.
    prewarm(lines, cfg) {
      if (cfg.tts !== "sarvam" && cfg.tts !== "openai") return;
      const todo = lines.map(speakable).filter(Boolean);
      const run = () => { const t = todo.shift(); if (t) this._synth(t, cfg, true).then(run); };
      run(); run();
    }
    // kind: "reply" (the model's words), "ack" (instant reflex), "filler" (while waiting)
    say(text, cfg, kind) {
      const shown = String(text);
      text = speakable(text);
      if (!text || cfg.tts === "off") return;
      const item = { text, shown, cfg, gen: this.gen, kind: kind || "reply" };
      if (cfg.tts === "sarvam" || cfg.tts === "openai") item.audio = this._synth(text, cfg, item.kind !== "reply");
      this.queue.push(item);
      if (!this.playing) this._next();
    }
    // Forget what was heard so far; call at the start of each reply.
    markTurn() { this.heardLog = []; }
    heard() { return this.heardLog.join(" "); }
    async _next() {
      const item = this.queue.shift();
      if (!item) { this.playing = false; this.current = null; this.onState(false); return; }
      this.playing = true; this.current = item; this.onState(true);
      if (item.kind === "reply") this.heardLog.push(item.shown);
      this.onStart(item);
      try {
        if (item.audio) {
          const blob = await item.audio;
          if (item.gen !== this.gen) return;
          if (blob) await this._playBlob(blob);
          else await this._browserSay(item.text, item.cfg); // cloud TTS failed — don't go silent
        } else {
          await this._browserSay(item.text, item.cfg);
        }
      } catch (e) { this.onError(e); }
      if (item.gen === this.gen) this._next();
    }
    _playBlob(blob) {
      return new Promise((res) => {
        const url = URL.createObjectURL(blob);
        this.audio.src = url;
        this.audio.onended = this.audio.onerror = () => { URL.revokeObjectURL(url); res(); };
        this._resolveCurrent = res;
        this.audio.play().catch(() => res());
      });
    }
    _browserSay(text, cfg) {
      return new Promise((res) => {
        if (!window.speechSynthesis) return res();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "hi-IN";
        const v = hiVoice || pickVoice();
        if (v) u.voice = v;
        // Reflex sounds come out a touch softer and slower, like a murmur.
        u.rate = (Number(cfg.rate) || 1) * (this.current && this.current.kind !== "reply" ? 0.92 : 1);
        u.pitch = 1.05;
        u.volume = this.current && this.current.kind !== "reply" ? 0.85 : 1;
        // Chrome sometimes never fires onend; don't let the conversation stall on it.
        const guard = setTimeout(res, 2500 + text.length * 110 / (Number(cfg.rate) || 1));
        u.onend = u.onerror = () => { clearTimeout(guard); res(); };
        this._resolveCurrent = res;
        speechSynthesis.speak(u);
      });
    }
    // Resolves once everything queued so far has been spoken (or stopped).
    drain() {
      return new Promise((res) => {
        const check = () => (this.busy ? setTimeout(check, 120) : res());
        check();
      });
    }
    stop() {
      this.gen++;
      this.queue = [];
      try { this.audio.pause(); } catch (e) {}
      if (window.speechSynthesis) speechSynthesis.cancel();
      if (this._resolveCurrent) this._resolveCurrent();
      this.playing = false;
      this.current = null;
      this.onState(false);
    }
  }

  // Splits a growing stream of text into speakable sentences.
  class SentenceSplitter {
    constructor(emit) { this.buf = ""; this.emit = emit; }
    push(delta) {
      this.buf += delta;
      let m;
      // Hindi full stop (।), ?, !, newline, or a Latin period followed by a space.
      while ((m = this.buf.match(/^([\s\S]*?[।?!\n]|[\s\S]*?\.(?=\s))\s*/))) {
        const s = m[1].trim();
        this.buf = this.buf.slice(m[0].length);
        if (s.replace(/[।?!.\s]/g, "").length) this.emit(s);
      }
    }
    flush() { const s = this.buf.trim(); this.buf = ""; if (s.replace(/[।?!.\s]/g, "").length) this.emit(s); }
  }

  const Voice = {
    supported: { browserASR: !!SR, browserTTS: !!window.speechSynthesis, recorder: !!(navigator.mediaDevices && window.MediaRecorder) },
    listen, monitor,
    stopListening() { Voice._stopRec && Voice._stopRec(); },
    abortListening() { Voice._abortRec && Voice._abortRec(); },
    Speaker, SentenceSplitter, speakable,
    hindiVoiceName: () => (hiVoice || pickVoice() || {}).name || null,
  };
  window.Voice = Voice;
})();
