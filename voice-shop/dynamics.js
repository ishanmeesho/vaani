// Conversation dynamics: the small human things around the words.
//
// A person on the other end of a call doesn't wait in dead silence while they
// think, doesn't cut you off when you pause mid-sentence, says "हम्म" when you
// tell them something, gives you space when you say "रुको, सोचने दो", stops
// when you say "बस-बस", and doesn't restart a long answer after you interrupt.
// None of that needs a language model — it needs to be instant — so it lives
// here, as local reflexes, and the model is told what happened so it can
// carry on naturally.
(function () {
  const norm = (t) => String(t || "").toLowerCase().replace(/[।,.!?…"'“”]/g, " ").replace(/\s+/g, " ").trim();
  const words = (t) => norm(t).split(" ").filter(Boolean);
  const any = (re, t) => re.test(norm(t));

  // ---------- word classes ----------
  const FILLER = /^(उम+|अ+म+|अं+|हम्म*|हम+|हूँ+|हुं+|ह+म+|अ+|ए+|um+|uh+|hmm+|mm+|उह+)$/;
  // Words a sentence trails off on when the speaker isn't finished.
  const TRAILING = new Set(["और", "तो", "कि", "या", "लेकिन", "पर", "मगर", "वो", "जो", "मतलब", "जैसे", "क्योंकि", "अगर", "फिर", "भी", "के", "की", "का", "को", "में", "से", "वाला", "वाली", "वाले", "एक", "थोड़ा", "कोई", "means", "and", "or", "but", "so", "like"]);
  const NOD_ONLY = /^((हाँ|हां|हा|जी|जी हाँ|जी हां|अच्छा|अच्छा अच्छा|अच्छा-अच्छा|ओके|ok|okay|ठीक|ठीक है|सही|सही है|हम्म*|हम+|हूँ|हुं|mm+|hmm+|yes|हाँ हाँ|हाँ जी|बढ़िया|वाह|हम्म अच्छा)\s*)+$/;
  const NO_ONLY = /^(नहीं|ना|नहीं नहीं|ना ना|नो|no|रहने दो|रहने दीजिए|छोड़ो|नहीं जी)$/;
  const STOP_NOW = /(^|\s)(रुको|रुकिए|रुक जाओ|बस|बस बस|एक मिनट|एक सेकंड|अरे रुको|ठहरो|wait|stop|hold on|नहीं नहीं)(\s|$)/;
  const HOLD = /(सोचने दो|सोचने दीजिए|सोच के बता|सोचकर बता|सोचता हूँ|सोचती हूँ|सोचते हैं|सोचना पड़ेगा|एक मिनट|एक सेकंड|रुको|रुकिए|ज़रा रुक|जरा रुक|थोड़ा रुक|let me think|wait|hold on|अभी बताता|अभी बताती|देखते हैं)/;
  const UNSURE = /(उम+|पता नहीं|शायद|समझ नहीं|confus|कंफ्यूज|डाउट|सोच रहा|सोच रही|तय नहीं|decide नहीं|दुविधा|कौन सा लूँ|क्या लूँ|क्या करूँ)/;
  const HAPPY = /(शादी|ब्याह|सगाई|त्योहार|त्यौहार|दिवाली|दीवाली|होली|राखी|रक्षाबंधन|करवा|तीज|ईद|बर्थडे|जन्मदिन|सालगिरह|एनिवर्सरी|गिफ्ट|गिफ़्ट|तोहफ|प्रमोशन|नौकरी लग|बच्चा हुआ|पोता|पोती|खुश|मज़ा|मजा)/;
  const UPSET = /(परेशान|गुस्सा|ख़राब|खराब|टूट|फट|नहीं आया|नहीं पहुँच|नहीं पहुंच|देर|लेट|शिकायत|बेकार|घटिया|problem|प्रॉब्लम|दिक्कत|दिक़्क़त|थक गई|थक गया|बीमार|दुखी|उदास|टेंशन|tension|परेशानी|गलत|ग़लत)/;
  const QUESTION = /(^|\s)(क्या|कैसा|कैसी|कैसे|कितना|कितनी|कितने|कब|कहाँ|कहां|क्यों|कौन|कौनसा|कौन सा|किसका|किसके|बताओ|बताइए|बताना|सकते|सकती|मिलेगा|मिलेगी|है क्या|what|how|which|when|why)(\s|$)/;
  const REQUEST = /(दिखाओ|दिखाइए|दिखा दो|ढूंढो|ढूंढिए|ढूँढो|खोजो|डाल दो|डालो|डालिए|ऐड|हटा दो|हटाओ|खोलो|खोलिए|कर दो|करो|कीजिए|चाहिए|भेज दो|भेजो|लगा दो|बदल दो|ले लो|लेना है|खरीदना|मंगाना|ऑर्डर|कैंसल|ट्रैक|रिटर्न|चलो|जाओ)/;
  const GREET = /^(नमस्ते|नमस्कार|हेलो|हैलो|हाय|hello|hi|राम राम|सत श्री अकाल|प्रणाम|good morning|गुड मॉर्निंग)/;
  const BYE = /^(बस|बाय|bye|अलविदा|ठीक है बस|बंद करो|फिर मिलते|चलो बाय|टाटा)\b/;

  // ---------- what Vaani says on reflex ----------
  const ACKS = {
    request: ["जी…", "ठीक है…", "जी, अभी…", "हाँ, एक सेकंड…", "अच्छा, अभी देखती हूँ…", "जी, बिल्कुल…"],
    question: ["हम्म…", "अच्छा…", "हम्म, देखती हूँ…", "अच्छा, एक सेकंड…", "हम्म, बताती हूँ…"],
    statement: ["अच्छा…", "हम्म, समझ गई…", "अच्छा-अच्छा…", "ओह, अच्छा…", "हम्म…"],
    happy: ["अरे वाह!", "ओहो, बढ़िया!", "अरे वाह, बहुत अच्छा!"],
    upset: ["ओह…", "अरे, ओह…", "हम्म, समझ सकती हूँ…", "ओह, ये तो ठीक नहीं हुआ…"],
    unsure: ["हम्म…", "अच्छा, कोई बात नहीं…", "हम्म, देखते हैं…"],
  };
  const HOLD_LINES = ["जी, आराम से सोचिए… मैं यहीं हूँ।", "हाँ-हाँ, कोई जल्दी नहीं।", "ज़रूर, सोच लीजिए… मैं सुन रही हूँ।", "जी, जितना समय चाहिए लीजिए।"];
  const STOPPED_LINES = ["जी?", "हाँ, बोलिए?", "जी, बताइए?"];
  const CHECKIN_LINES = ["मैं यहीं हूँ… आराम से बताइए।", "जी, जब तैयार हों, बोलिए।", "कोई जल्दी नहीं… मैं सुन रही हूँ।"];
  const GOODBYE_LINES = ["ठीक है, जब मन हो माइक दबा दीजिए… मैं यहीं मिलूँगी।", "चलिए, जब चाहें फिर बात करेंगे।"];
  const PROGRESS = {
    search_products: ["ढूंढ रही हूँ…", "देखती हूँ क्या-क्या है…", "एक सेकंड, निकाल रही हूँ…"],
    open_product: ["खोल रही हूँ…"],
    get_product_details: ["देख रही हूँ…", "एक सेकंड, जानकारी देखती हूँ…"],
    compare_products: ["दोनों को साथ रख रही हूँ…"],
    add_to_cart: ["डाल रही हूँ…"],
    order_action: ["आपका ऑर्डर देख रही हूँ…", "एक सेकंड, ऑर्डर देखती हूँ…"],
    place_order: ["बस एक पल…"],
    save_address: ["पता सेव कर रही हूँ…"],
    _: ["बस एक सेकंड…", "एक पल…", "हम्म, देख रही हूँ…"],
  };

  const recent = [];
  function pick(pool) {
    const fresh = pool.filter((x) => !recent.includes(x));
    const choice = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    recent.push(choice);
    if (recent.length > 6) recent.shift();
    return choice;
  }

  // ---------- reading the user's turn ----------
  function classify(text) {
    const t = norm(text), w = words(text);
    if (!w.length) return "empty";
    if (w.every((x) => FILLER.test(x))) return "filler";
    if (NOD_ONLY.test(t)) return "nod";
    if (NO_ONLY.test(t)) return "no";
    if (BYE.test(t)) return "bye";
    if (w.length <= 5 && HOLD.test(t) && !REQUEST.test(t.replace(/रुको|रुकिए/g, ""))) return "hold";
    if (GREET.test(t) && w.length <= 4) return "greet";
    if (UPSET.test(t)) return "upset";
    if (HAPPY.test(t)) return "happy";
    if (UNSURE.test(t)) return "unsure";
    if (QUESTION.test(t) || /\?\s*$/.test(text)) return "question";
    if (REQUEST.test(t)) return "request";
    return "statement";
  }

  // Does the user sound unfinished? Used to wait longer before replying.
  function trailsOff(text) {
    const w = words(text);
    if (!w.length) return false;
    const last = w[w.length - 1];
    return FILLER.test(last) || TRAILING.has(last);
  }

  // How long a pause ends the user's turn, given what they've said so far.
  function endpointDelay(text) {
    const w = words(text);
    if (!w.length) return 1200;
    if (w.every((x) => FILLER.test(x))) return 3200;
    if (trailsOff(text)) return 2600;
    if (w.length <= 2) return 1100;
    return 1000;
  }

  // The instant acknowledgement for a turn, or null when silence is more natural.
  let ackStreak = 0;
  function ackFor(cls, text) {
    let pool = null;
    if (cls === "happy" || cls === "upset" || cls === "unsure") pool = ACKS[cls];
    else if (cls === "request" || cls === "question" || cls === "statement") {
      if (words(text).length < 3 && cls !== "request") return null;
      // Don't make it a tic: after two acked turns in a row, sometimes just answer.
      if (ackStreak >= 2 && Math.random() < 0.5) { ackStreak = 0; return null; }
      pool = cls === "statement" && words(text).length > 9 ? ACKS.statement : ACKS[cls];
    }
    if (!pool) { ackStreak = 0; return null; }
    ackStreak++;
    return pick(pool);
  }

  // What the model should know about how this turn was spoken.
  function signals(text, cls, ctx) {
    const s = [];
    if (ctx.ack) s.push(`तुमने अभी-अभी तुरंत "${ctx.ack}" कह दिया है — इसे दोहराओ मत और दूसरी हामी से शुरू मत करो, सीधे बात आगे बढ़ाओ।`);
    if (ctx.interrupted) s.push(`यूज़र ने तुम्हें बोलते हुए बीच में टोका। उसने तुम्हारा बस इतना सुना: "${ctx.interrupted.heard || "(कुछ नहीं)"}"। पुराना जवाब दोबारा शुरू मत करो — जो उसने अभी कहा उसका जवाब दो; बचा हुआ कुछ ज़रूरी हो तो एक लाइन में।`);
    if (ctx.thinkMs > 4000 && !ctx.heldMs) s.push(`यूज़र ने जवाब देने से पहले लगभग ${Math.round(ctx.thinkMs / 1000)} सेकंड सोचा।`);
    if (ctx.heldMs > 0) s.push(`पिछली बार यूज़र ने सोचने का समय माँगा था और ${Math.round(ctx.heldMs / 1000)} सेकंड सोचा — अब फ़ैसले पर हल्के से मदद करो, दबाव नहीं।`);
    if (ctx.nods && ctx.nods.length) s.push(`तुम्हारे पिछले जवाब के दौरान यूज़र बीच-बीच में हामी भर रहा था ("${ctx.nods.join('", "')}") — यानी वह ध्यान से सुन रहा था।`);
    if (cls === "nod") s.push("यूज़र ने बस हामी भरी — छोटा जवाब दो या अगले स्वाभाविक कदम पर बढ़ो, लंबा मत बोलो।");
    if (cls === "unsure" || (/(^|\s)(उम+|अं+)(\s|$)/.test(norm(text)) && cls !== "filler")) s.push("यूज़र झिझकते/अनिश्चित लग रहा है — दबाव मत डालो, विकल्प दो तक सीमित करो या एक सरल सुझाव दो।");
    if (cls === "upset") s.push("यूज़र परेशान लग रहा है — पहले हमदर्दी, फिर हल।");
    if (cls === "happy") s.push("यूज़र किसी ख़ुशी की बात कर रहा है — उसकी ख़ुशी में शामिल हो।");
    if (ctx.continued) s.push("यूज़र रुक-रुक कर, सोचते हुए बोला।");
    return s;
  }

  // Words of an interim transcript that also occur in what Vaani is saying are
  // probably her own voice leaking into the mic.
  function isEcho(text, spoken) {
    const w = words(text);
    if (!w.length) return true;
    const sp = new Set(words(spoken));
    const hits = w.filter((x) => sp.has(x)).length;
    return hits / w.length >= 0.6;
  }

  // While Vaani is talking: is the user nodding along, telling her to stop, or taking the floor?
  function duringSpeech(text, spoken) {
    const t = norm(text), w = words(text);
    if (!w.length || isEcho(text, spoken)) return "echo";
    if (STOP_NOW.test(t) && w.length <= 3) return "stop";
    if (NOD_ONLY.test(t) || w.every((x) => FILLER.test(x))) return "nod";
    if (w.length >= 3 || (w.length >= 2 && !NOD_ONLY.test(t))) return "speech";
    return "unclear";
  }

  window.Dynamics = {
    classify, trailsOff, endpointDelay, ackFor, signals, isEcho, duringSpeech,
    progressFor: (tool) => pick(PROGRESS[tool] || PROGRESS._),
    holdLine: () => pick(HOLD_LINES), stoppedLine: () => pick(STOPPED_LINES),
    checkinLine: () => pick(CHECKIN_LINES), goodbyeLine: () => pick(GOODBYE_LINES),
    allReflexLines: () => [].concat(...Object.values(ACKS), HOLD_LINES, STOPPED_LINES, CHECKIN_LINES, ...Object.values(PROGRESS)),
  };
})();
