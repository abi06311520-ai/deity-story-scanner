const camera = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const languageSelect = document.getElementById("language");
const startCameraBtn = document.getElementById("startCameraBtn");
const scanBtn = document.getElementById("scanBtn");
const statusText = document.getElementById("status");
const frameHint = document.getElementById("frameHint");
const resultSection = document.getElementById("resultSection");
const deityName = document.getElementById("deityName");
const storyText = document.getElementById("storyText");
const conclusionText = document.getElementById("conclusionText");
const storyLanguage = document.getElementById("storyLanguage");
const blessing = document.getElementById("blessing");
const mouth = document.getElementById("mouth");
const speakBtn = document.getElementById("speakBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const voiceStatus = document.getElementById("voiceStatus");

let cameraStream = null;
let currentStory = "";
let currentConclusion = "";
let currentDeity = "";
let currentLanguage = "Tamil";
let currentGender = "male";
let currentUtterance = null;
let isTranslating = false;

const languageCodes = { Tamil: "ta-IN", English: "en-IN", Hindi: "hi-IN", Telugu: "te-IN", Malayalam: "ml-IN", Kannada: "kn-IN" };
const languageFontClasses = { Tamil: "script-tamil", Hindi: "script-hindi", Telugu: "script-telugu", Malayalam: "script-malayalam", Kannada: "script-kannada", English: "script-english" };
const femaleDeities = new Set(["lakshmi", "durga", "parvati", "saraswati", "kali", "amman", "mariamman", "radha", "sita", "ganga", "yamuna", "gayatri", "meenakshi", "kamakshi", "annapurna", "bhuvaneshwari", "chamunda", "chandraghanta", "chinnamasta", "dhanalakshmi", "dhoomavati", "lalita", "mahagauri", "matangi", "santoshi", "shailaputri", "skandamata", "brahmacharini", "kalaratri", "siddhidatri", "tripurasundari", "tulasi", "vaishnodevi", "andal", "bhavani", "katyayani", "kushmanda", "rukmini", "shakti", "vindhyavasini", "chandika"]);
function deityKey(name) { return (name || "").toLowerCase().replace(/[^a-z]/g, ""); }
function deityGender(name) {
  const key = deityKey(name);
  if (/(goddess|devi|amma)$/.test(key) || [...femaleDeities].some((goddess) => key.includes(goddess))) return "female";
  return "male";
}

function setStatus(message, kind = "") {
  statusText.innerHTML = `<span class="status-glyph">${kind === "error" ? "!" : "✧"}</span> ${message}`;
  statusText.classList.toggle("error", kind === "error");
}

startCameraBtn.addEventListener("click", async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    camera.srcObject = cameraStream;
    camera.classList.add("active");
    document.querySelector(".camera-placeholder").classList.add("hidden");
    frameHint.textContent = "· LIVE";
    startCameraBtn.innerHTML = "<span>✓</span> Camera open";
    startCameraBtn.disabled = true;
    scanBtn.disabled = false;
    setStatus("The sacred frame is open. Hold the statue steady.");
  } catch (error) {
    console.error(error);
    setStatus("Camera permission was not granted. Allow access and try again.", "error");
  }
});

scanBtn.addEventListener("click", () => {
  if (!cameraStream || camera.videoWidth === 0) return setStatus("Please open the camera and wait for the frame to appear.", "error");
  unlockNarrationAudio();
  const scale = Math.min(1, 768 / camera.videoWidth);
  canvas.width = Math.round(camera.videoWidth * scale);
  canvas.height = Math.round(camera.videoHeight * scale);
  canvas.getContext("2d").drawImage(camera, 0, 0, canvas.width, canvas.height);
  setStatus("Reading the presence… the story is gathering.");
  scanBtn.disabled = true;
  canvas.toBlob(sendScannedImage, "image/jpeg", 0.72);
});

async function sendScannedImage(imageBlob) {
  const formData = new FormData();
  currentLanguage = languageSelect.value;
  formData.append("image", imageBlob, "sacred-statue.jpg");
  formData.append("language", currentLanguage);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("/scan", { method: "POST", body: formData, signal: controller.signal });
    clearTimeout(timeout);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scanning failed.");
    if (typeof stopGayatriSequence === "function") stopGayatriSequence();
    applyStory(data);
    
    const imageObjectURL = URL.createObjectURL(imageBlob);
    const scannedImage = document.getElementById("scannedImage");
    const orbFace = document.getElementById("orbFace");
    if(scannedImage && orbFace) {
       scannedImage.src = imageObjectURL;
       scannedImage.style.display = "block";
       orbFace.style.display = "none";
    }
    
    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    createLightBurst();
    setStatus("Presence revealed. The deity is speaking now.");
    startAutomaticNarration();
  } catch (error) {
    console.error(error);
    setStatus(error.name === "AbortError" ? "The scan took too long. Please hold the statue steady and try again." : error.message, "error");
  } finally { scanBtn.disabled = false; }
}

function applyStory(data) {
  currentStory = data.story || "";
  currentConclusion = data.conclusion || "";
  currentDeity = data.deity || currentDeity;
  currentLanguage = data.language || currentLanguage;
  const reportedGender = String(data.gender || "").toLowerCase();
  currentGender = ["male", "female"].includes(reportedGender) ? reportedGender : deityGender(currentDeity);
  deityName.textContent = currentDeity;
  storyLanguage.textContent = currentLanguage;
  blessing.textContent = `${currentLanguage} narration · first-person voice`;
  renderStoryWords(currentStory);
  conclusionText.textContent = currentConclusion;
  storyText.className = `story-text ${languageFontClasses[currentLanguage] || ""}`;
  conclusionText.className = languageFontClasses[currentLanguage] || "";
}

function renderStoryWords(story) {
  storyText.innerHTML = "";
  story.trim().split(/\s+/).filter(Boolean).forEach((word, index) => {
    const span = document.createElement("span");
    span.className = "story-word";
    span.id = `word-${index}`;
    span.textContent = `${word} `;
    storyText.appendChild(span);
  });
}

function clearHighlights() { document.querySelectorAll(".story-word").forEach((word) => word.classList.remove("active-word")); }
function findGenderLanguageVoice(language, gender = currentGender) {
  const voices = window.speechSynthesis.getVoices();
  const code = languageCodes[language] || "en-IN";
  const regional = voices.filter((voice) => voice.lang.toLowerCase().startsWith(code.slice(0, 2)));
  const genderWords = gender === "female" ? ["female", "woman", "zira", "samantha", "veena", "lekha", "siri", "priya"] : ["male", "man", "david", "ravi", "mohan", "daniel", "guy", "rishi"];
  const genderMatch = (voice) => genderWords.some((word) => voice.name.toLowerCase().includes(word));
  return regional.find(genderMatch) || null;
}
function findLanguageVoice(language) {
  const prefix = (languageCodes[language] || "en-IN").slice(0, 2).toLowerCase();
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(prefix)) || null;
}
function getPreferredVoice(language, gender = currentGender) {
  const voices = window.speechSynthesis.getVoices();
  const code = languageCodes[language] || "en-IN";
  const regional = voices.filter((voice) => voice.lang.toLowerCase().startsWith(code.slice(0, 2)));
  return findGenderLanguageVoice(language, gender) || regional[0] || voices[0] || null;
}

function setTalking(isTalking) {
  const scannedImage = document.getElementById("scannedImage");
  if (isTalking) {
    mouth.classList.add("talking");
    if (scannedImage) scannedImage.classList.add("talking");
  } else {
    mouth.classList.remove("talking");
    if (scannedImage) scannedImage.classList.remove("talking");
  }
}

function speakStory() {
  if (!currentStory) return;
  window.speechSynthesis.cancel();
  currentUtterance = new SpeechSynthesisUtterance(`${currentStory} ${currentConclusion}`);
  currentUtterance.lang = languageCodes[currentLanguage] || "en-IN";
  currentUtterance.voice = getPreferredVoice(currentLanguage, currentGender);
  currentUtterance.rate = 0.82;
  currentUtterance.pitch = currentGender === "female" ? 1.08 : 0.84;
  currentUtterance.volume = 1;
  const words = document.querySelectorAll(".story-word");
  currentUtterance.onstart = () => { setTalking(true); voiceStatus.textContent = `${currentDeity} is speaking in ${currentLanguage}`; };
  currentUtterance.onboundary = (event) => {
    const wordIndex = currentStory.substring(0, event.charIndex).trim().split(/\s+/).filter(Boolean).length - 1;
    clearHighlights();
    const activeWord = document.getElementById(`word-${wordIndex}`);
    if (activeWord) { activeWord.classList.add("active-word"); activeWord.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  };
  currentUtterance.onpause = () => { setTalking(false); voiceStatus.textContent = "The story is resting."; };
  currentUtterance.onresume = () => { setTalking(true); voiceStatus.textContent = `${currentDeity} is speaking…`; };
  currentUtterance.onend = () => { setTalking(false); clearHighlights(); voiceStatus.textContent = "The blessing has been received."; if (typeof beginGayatriSequence === "function") beginGayatriSequence(); };
  currentUtterance.onerror = (error) => { console.error(error); setTalking(false); voiceStatus.textContent = `Speech is unavailable for ${currentLanguage}.`; };
  const immediateVoice = findGenderLanguageVoice(currentLanguage, currentGender) || findLanguageVoice(currentLanguage);
  if (immediateVoice) {
    currentUtterance.voice = immediateVoice;
    window.speechSynthesis.speak(currentUtterance);
    return;
  }
  playServerNarration(`${currentStory} ${currentConclusion}`, currentLanguage, currentGender, () => currentUtterance.onend?.());
}

languageSelect.addEventListener("change", async () => {
  const nextLanguage = languageSelect.value;
  if (!currentStory || isTranslating) return;
  const previousLanguage = currentLanguage;
  isTranslating = true;
  if (typeof stopGayatriSequence === "function") stopGayatriSequence();
  window.speechSynthesis.cancel();
  generatedNarrationAudio?.pause?.();
  currentLanguage = nextLanguage;
  updateMantraStep();
  setTalking(false);
  voiceStatus.textContent = `Translating the blessing into ${nextLanguage}…`;
  setStatus(`Opening the ${nextLanguage} edition of this story…`);
  try {
    const response = await fetch("/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deity: currentDeity, gender: currentGender, story: currentStory, conclusion: currentConclusion, language: nextLanguage }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Translation failed.");
    applyStory(data);
    voiceStatus.textContent = `The deity is speaking in ${nextLanguage}`;
    setStatus(`The words and voice are now in ${nextLanguage}.`);
    startAutomaticNarration();
  } catch (error) {
    console.error(error);
    currentLanguage = previousLanguage;
    languageSelect.value = previousLanguage;
    updateMantraStep();
    setStatus(error.message, "error");
  } finally { isTranslating = false; }
});

speakBtn.addEventListener("click", speakStory);
pauseBtn.addEventListener("click", () => { if (generatedNarrationAudio && !generatedNarrationAudio.paused) generatedNarrationAudio.pause(); else if (generatedNarrationAudio?.paused) generatedNarrationAudio.play(); else if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) window.speechSynthesis.pause(); else if (window.speechSynthesis.paused) window.speechSynthesis.resume(); });
stopBtn.addEventListener("click", () => { generatedNarrationAudio?.pause?.(); if (generatedNarrationAudio) generatedNarrationAudio.currentTime = 0; window.speechSynthesis.cancel(); setTalking(false); clearHighlights(); voiceStatus.textContent = "The story is quiet."; });

function createLightBurst() {
  ["✦", "✧", "·", "✦", "✧", "✦", "·", "✧"].forEach((symbol, index) => {
    const element = document.createElement("div");
    element.className = "burst-light";
    const angle = (index / 8) * Math.PI * 2;
    const distance = 110 + Math.random() * 170;
    element.textContent = symbol;
    element.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    element.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 1500);
  });
}

window.speechSynthesis.onvoiceschanged = () => getPreferredVoice(currentLanguage);
window.addEventListener("beforeunload", () => { cameraStream?.getTracks().forEach((track) => track.stop()); window.speechSynthesis.cancel(); });

function startAutomaticNarration() {
  window.speechSynthesis.cancel();
  if (generatedNarrationAudio) {
    generatedNarrationAudio.onended = null;
    generatedNarrationAudio.onerror = null;
    generatedNarrationAudio.pause();
    generatedNarrationAudio.currentTime = 0;
  }
  if (typeof window.speechSynthesis.resume === "function") window.speechSynthesis.resume();
  speakStory();
}


// Additive devotional experience: music and Gayatri Mantra interaction.
const devotionalFeatures = document.getElementById("devotionalFeatures");
const deitySong = document.getElementById("deitySong");
const musicPlayBtn = document.getElementById("musicPlayBtn");
const musicPauseBtn = document.getElementById("musicPauseBtn");
const musicStopBtn = document.getElementById("musicStopBtn");
const musicTitle = document.getElementById("musicTitle");
const musicStatus = document.getElementById("musicStatus");
const songTitle = document.getElementById("songTitle");
const songStatus = document.getElementById("songStatus");
const hearGodSongBtn = document.getElementById("hearGodSongBtn");
const mantraListenBtn = document.getElementById("mantraListenBtn");
const mantraStopBtn = document.getElementById("mantraStopBtn");
const mantraStatus = document.getElementById("mantraStatus");
const mantraTranscript = document.getElementById("mantraTranscript");

const deityMusicTitles = { shiva: "Shiva devotional background", ganesha: "Ganesha devotional background", krishna: "Krishna devotional background", vishnu: "Vishnu devotional background", lakshmi: "Lakshmi devotional background", durga: "Durga devotional background", parvati: "Parvati devotional background", saraswati: "Saraswati devotional background", hanuman: "Hanuman devotional background", rama: "Rama devotional background", murugan: "Murugan devotional background", ayyappa: "Ayyappa devotional background" };
let mantraRecognition = null;
let mantraListening = false;

function setupDevotionalMusic() {
  if (!deitySong) return;
  const deityKey = currentDeity.toLowerCase().replace(/[^a-z]/g, "");
  const languageKey = currentLanguage.toLowerCase();
  // Add deity/language recordings under static/audio/songs when available.
  // The generated track remains a safe fallback until those recordings are added.
  deitySong.src = `/static/audio/songs/${deityKey}-${languageKey}.mp3`;
  deitySong.volume = 1;
  if (musicTitle) musicTitle.textContent = deityMusicTitles[deityKey] || `${currentDeity} song`;
  if (musicStatus) musicStatus.textContent = `${currentLanguage} song ready`;
  if (songTitle) songTitle.textContent = `${currentDeity} · ${currentLanguage} song`;
  if (songStatus) songStatus.textContent = "Complete the Gayatri Mantra first.";
  if (hearGodSongBtn) hearGodSongBtn.disabled = true;
}

async function playDeitySong(fromUserGesture = false) {
  if (!currentDeity) return;
  const query = `${currentDeity} ${currentLanguage} devotional song bhajan`;
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  window.open(youtubeUrl, "_blank", "noopener,noreferrer");
  if (musicStatus) musicStatus.textContent = `Opening YouTube: ${currentLanguage} ${currentDeity} song`;
  if (songStatus) songStatus.textContent = `YouTube opened for the ${currentLanguage} song of ${currentDeity}.`;
}
function pauseDeitySong() { if (!deitySong) return; deitySong.pause(); if (musicStatus) musicStatus.textContent = "The song is paused"; if (musicPlayBtn) musicPlayBtn.disabled = false; }
function stopDeitySong() { if (!deitySong) return; deitySong.pause(); deitySong.currentTime = 0; if (musicStatus) musicStatus.textContent = "The song is quiet"; if (musicPlayBtn) musicPlayBtn.disabled = false; }

function speakMantraResponse(message, recognized) {
  if (!message) return;
  window.speechSynthesis.cancel();
  const responseUtterance = new SpeechSynthesisUtterance(message);
  responseUtterance.lang = languageCodes[currentLanguage] || "en-IN";
  responseUtterance.voice = getPreferredVoice(currentLanguage);
  responseUtterance.rate = 0.88;
  responseUtterance.pitch = 1;
  responseUtterance.onstart = () => { voiceStatus.textContent = recognized ? "The blessing is responding" : "The mantra guidance is speaking"; };
  responseUtterance.onend = () => { voiceStatus.textContent = recognized ? "The blessing has been received." : "Ready to listen again."; if (recognized) playDeitySong(false); };
  window.speechSynthesis.speak(responseUtterance);
}

async function verifyMantraTranscript(transcript) {
  mantraTranscript.textContent = `Heard: “${transcript}”`;
  mantraStatus.innerHTML = "<span>✦</span> Checking the sacred words…";
  try {
    const response = await fetch("/verify-mantra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript, deity: currentDeity, language: currentLanguage }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Mantra verification failed.");
    mantraStatus.innerHTML = data.recognized ? "<span>✦</span> Wow, very good. Your prayer was heard." : "<span>✧</span> I could not hear the full mantra. Please try again.";
    speakMantraResponse(data.message, data.recognized);
    if (data.recognized) playDeitySong(false);
  } catch (error) { console.error(error); mantraStatus.innerHTML = "<span>!</span> The prayer could not be checked. Please try again."; }
}

function startMantraListening() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { mantraStatus.innerHTML = "<span>!</span> Voice listening is not supported in this browser. Please use Chrome or Edge."; return; }
  if (mantraListening) return;
  mantraRecognition = new Recognition();
  mantraRecognition.lang = languageCodes[currentLanguage] || "en-IN";
  mantraRecognition.continuous = false;
  mantraRecognition.interimResults = true;
  mantraRecognition.onstart = () => { mantraListening = true; mantraListenBtn.disabled = true; mantraStopBtn.disabled = false; mantraTranscript.textContent = "Listening… recite the Gayatri Mantra now."; mantraStatus.innerHTML = "<span>◉</span> I am listening to your prayer…"; };
  mantraRecognition.onresult = (event) => { const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ").trim(); mantraTranscript.textContent = transcript ? `Heard: “${transcript}”` : "Listening…"; if (event.results[event.results.length - 1].isFinal) verifyMantraTranscript(transcript); };
  mantraRecognition.onerror = (event) => { if (event.error !== "no-speech" && event.error !== "aborted") mantraStatus.innerHTML = `<span>!</span> Microphone listening stopped: ${event.error}.`; };
  mantraRecognition.onend = () => { mantraListening = false; mantraListenBtn.disabled = false; mantraStopBtn.disabled = true; };
  mantraRecognition.start();
}
function stopMantraListening() { if (mantraRecognition && mantraListening) mantraRecognition.stop(); mantraListening = false; if (mantraListenBtn) mantraListenBtn.disabled = false; if (mantraStopBtn) mantraStopBtn.disabled = true; if (mantraStatus) mantraStatus.innerHTML = "<span>✧</span> Listening stopped."; }

if (musicPlayBtn) musicPlayBtn.addEventListener("click", () => playDeitySong(true));
if (musicPauseBtn) musicPauseBtn.addEventListener("click", pauseDeitySong);
if (musicStopBtn) musicStopBtn.addEventListener("click", stopDeitySong);
if (mantraListenBtn) mantraListenBtn.addEventListener("click", startMantraListening);
if (hearGodSongBtn) hearGodSongBtn.addEventListener("click", () => playDeitySong(true));
if (deitySong) deitySong.addEventListener("ended", () => { if (musicPlayBtn) musicPlayBtn.disabled = false; });

const originalApplyStory = applyStory;
applyStory = function(data) { originalApplyStory(data); setupDevotionalMusic(); };
const originalSpeakStory = speakStory;
speakStory = function() { originalSpeakStory(); };
window.addEventListener("beforeunload", () => { stopDeitySong(); stopMantraListening(); });


// Final devotional sequence: story -> Gayatri Mantra -> good thought -> God’s song.
const mantraReciteBtn = document.getElementById("mantraReciteBtn");
const mantraReplayBtn = document.getElementById("mantraReplayBtn");
const mantraText = document.getElementById("mantraText");
const mantraTitle = document.getElementById("mantraTitle");
let mantraSequenceActive = false;
let mantraRecognitionFinal = null;

const gayatriByDeity = {
  shiva: "Om Tatpurushaya Vidmahe Mahadevaya Dhimahi Tanno Rudrah Prachodayat",
  ganesha: "Om Ekadantaya Vidmahe Vakratundaya Dhimahi Tanno Dantih Prachodayat",
  vishnu: "Om Narayanaya Vidmahe Vasudevaya Dhimahi Tanno Vishnuh Prachodayat",
  lakshmi: "Om Mahalakshmyai Vidmahe Vishnu Patnyai Dhimahi Tanno Lakshmi Prachodayat",
  durga: "Om Katyayanyai Vidmahe Kanyakumari Dhimahi Tanno Durgih Prachodayat",
  krishna: "Om Damodaraaya Vidmahe Vasudevaya Dhimahi Tanno Krishnah Prachodayat",
  rama: "Om Dasharathaya Vidmahe Sitavallabhaya Dhimahi Tanno Ramah Prachodayat",
  hanuman: "Om Anjaneyaya Vidmahe Vayuputraya Dhimahi Tanno Hanumat Prachodayat",
  murugan: "Om Tatpurushaya Vidmahe Mahasenaya Dhimahi Tanno Shanmukhah Prachodayat",
  saraswati: "Om Saraswatyai Vidmahe Brahmaputriyai Dhimahi Tanno Devi Prachodayat",
  parvati: "Om Jagat Jananyai Vidmahe Shakti Rupayai Dhimahi Tanno Gauri Prachodayat",
  ayyappa: "Om Bhootanathaya Vidmahe Bhavaputrayai Dhimahi Tanno Shastha Prachodayat",
  generic: "Om bhur bhuvah svah, tat savitur varenyam, bhargo devasya dhimahi, dhiyo yo nah prachodayat",
};
function currentGayatri() {
  const key = deityKey(currentDeity);
  const match = Object.keys(gayatriByDeity).find((deity) => deity !== "generic" && key.includes(deity));
  return gayatriByDeity[match || "generic"];
}

// Keep the mantra wording unchanged, but render its Sanskrit sounds in the
// script selected by the user so the display and spoken text follow language.
const mantraScripts = {
  Hindi: {
    vowels: { a: "अ", aa: "आ", i: "इ", ii: "ई", u: "उ", uu: "ऊ", e: "ए", ai: "ऐ", o: "ओ", au: "औ" },
    signs: { a: "", aa: "ा", i: "ि", ii: "ी", u: "ु", uu: "ू", e: "े", ai: "ै", o: "ो", au: "ौ" },
    consonants: { k: "क", kh: "ख", g: "ग", gh: "घ", ng: "ङ", c: "च", ch: "छ", j: "ज", jh: "झ", ny: "ञ", T: "ट", Th: "ठ", D: "ड", Dh: "ढ", N: "ण", t: "त", th: "थ", d: "द", dh: "ध", n: "न", p: "प", ph: "फ", b: "ब", bh: "भ", m: "म", y: "य", r: "र", l: "ल", v: "व", w: "व", sh: "श", Sh: "ष", s: "स", h: "ह" },
    virama: "्", anusvara: "ं", visarga: "ः", om: "ॐ",
  },
  Tamil: {
    vowels: { a: "அ", aa: "ஆ", i: "இ", ii: "ஈ", u: "உ", uu: "ஊ", e: "எ", ai: "ஐ", o: "ஒ", au: "ஔ" },
    signs: { a: "", aa: "ா", i: "ி", ii: "ீ", u: "ு", uu: "ூ", e: "ெ", ai: "ை", o: "ொ", au: "ௌ" },
    consonants: { k: "க", kh: "க", g: "க", gh: "க", ng: "ங", c: "ச", ch: "ச", j: "ஜ", jh: "ஜ", ny: "ஞ", T: "ட", Th: "ட", D: "ட", Dh: "ட", N: "ண", t: "த", th: "த", d: "த", dh: "த", n: "ந", p: "ப", ph: "ப", b: "ப", bh: "ப", m: "ம", y: "ய", r: "ர", l: "ல", v: "வ", w: "வ", sh: "ஷ", Sh: "ஷ", s: "ஸ", h: "ஹ" },
    virama: "்", anusvara: "ம்", visarga: "ஃ", om: "ௐ",
  },
  Telugu: {
    vowels: { a: "అ", aa: "ఆ", i: "ఇ", ii: "ఈ", u: "ఉ", uu: "ఊ", e: "ఏ", ai: "ఐ", o: "ఓ", au: "ఔ" },
    signs: { a: "", aa: "ా", i: "ి", ii: "ీ", u: "ు", uu: "ూ", e: "ే", ai: "ై", o: "ో", au: "ౌ" },
    consonants: { k: "క", kh: "ఖ", g: "గ", gh: "ఘ", ng: "ఙ", c: "చ", ch: "ఛ", j: "జ", jh: "ఝ", ny: "ఞ", T: "ట", Th: "ఠ", D: "డ", Dh: "ఢ", N: "ణ", t: "త", th: "థ", d: "ద", dh: "ధ", n: "న", p: "ప", ph: "ఫ", b: "బ", bh: "భ", m: "మ", y: "య", r: "ర", l: "ల", v: "వ", w: "వ", sh: "శ", Sh: "ష", s: "స", h: "హ" },
    virama: "్", anusvara: "ం", visarga: "ః", om: "ఓం",
  },
  Malayalam: {
    vowels: { a: "അ", aa: "ആ", i: "ഇ", ii: "ഈ", u: "ഉ", uu: "ഊ", e: "ഏ", ai: "ഐ", o: "ഓ", au: "ഔ" },
    signs: { a: "", aa: "ാ", i: "ി", ii: "ീ", u: "ു", uu: "ൂ", e: "േ", ai: "ൈ", o: "ോ", au: "ൗ" },
    consonants: { k: "ക", kh: "ഖ", g: "ഗ", gh: "ഘ", ng: "ങ", c: "ച", ch: "ഛ", j: "ജ", jh: "ഝ", ny: "ഞ", T: "ട", Th: "ഠ", D: "ഡ", Dh: "ഢ", N: "ണ", t: "ത", th: "ഥ", d: "ദ", dh: "ധ", n: "ന", p: "പ", ph: "ഫ", b: "ബ", bh: "ഭ", m: "മ", y: "യ", r: "ര", l: "ല", v: "വ", w: "വ", sh: "ശ", Sh: "ഷ", s: "സ", h: "ഹ" },
    virama: "്", anusvara: "ം", visarga: "ഃ", om: "ഓം",
  },
  Kannada: {
    vowels: { a: "ಅ", aa: "ಆ", i: "ಇ", ii: "ಈ", u: "ಉ", uu: "ಊ", e: "ಏ", ai: "ಐ", o: "ಓ", au: "ಔ" },
    signs: { a: "", aa: "ಾ", i: "ಿ", ii: "ೀ", u: "ು", uu: "ೂ", e: "ೇ", ai: "ೈ", o: "ೋ", au: "ೌ" },
    consonants: { k: "ಕ", kh: "ಖ", g: "ಗ", gh: "ಘ", ng: "ಙ", c: "ಚ", ch: "ಛ", j: "ಜ", jh: "ಝ", ny: "ಞ", T: "ಟ", Th: "ಠ", D: "ಡ", Dh: "ಢ", N: "ಣ", t: "ತ", th: "ಥ", d: "ದ", dh: "ಧ", n: "ನ", p: "ಪ", ph: "ಫ", b: "ಬ", bh: "ಭ", m: "ಮ", y: "ಯ", r: "ರ", l: "ಲ", v: "ವ", w: "ವ", sh: "ಶ", Sh: "ಷ", s: "ಸ", h: "ಹ" },
    virama: "್", anusvara: "ಂ", visarga: "ಃ", om: "ಓಂ",
  },
};

function mantraInSelectedScript(text, language) {
  const script = mantraScripts[language];
  if (!script) return text;
  return text.replace(/[A-Za-z]+|[^A-Za-z]+/g, (part) => {
    if (!/[A-Za-z]/.test(part)) return part;
    if (part.toLowerCase() === "om") return script.om;
    const tokens = part.toLowerCase().match(/chh|kh|gh|ch|jh|th|dh|ph|bh|sh|ng|ny|aa|ii|ee|uu|oo|ai|au|[a-z]/g) || [];
    let output = "";
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const vowel = token === "ee" ? "ii" : token === "oo" ? "uu" : token;
      if (script.vowels[vowel]) {
        const previous = tokens[index - 1];
        output += previous && script.consonants[previous] ? script.signs[vowel] : script.vowels[vowel];
        continue;
      }
      const consonant = token === "ch" ? script.consonants.c : token === "chh" ? script.consonants.ch : script.consonants[token];
      if (!consonant) { output += token; continue; }
      const next = tokens[index + 1];
      if (next && script.vowels[next === "ee" ? "ii" : next === "oo" ? "uu" : next]) {
        output += consonant;
      } else if (index === tokens.length - 1 && token === "m") {
        output += script.anusvara;
      } else if (index === tokens.length - 1 && token === "h") {
        output += script.visarga;
      } else {
        output += consonant + script.virama;
      }
    }
    return output;
  });
}

function slowMantraText() { return mantraInSelectedScript(currentGayatri(), currentLanguage).split(/\s+/).filter(Boolean).join(", "); }

function updateMantraStep() {
  if (!mantraText) return;
  mantraTitle.textContent = `Gayatri Mantra for ${currentDeity}`;
  mantraText.textContent = mantraInSelectedScript(currentGayatri(), currentLanguage);
  mantraText.className = `mantra-text ${languageFontClasses[currentLanguage] || ""}`;
  mantraStatus.innerHTML = "The app will recite the mantra first.";
  mantraTranscript.textContent = "";
  mantraReciteBtn.disabled = false;
  mantraStopBtn.disabled = true;
  if (hearGodSongBtn) hearGodSongBtn.disabled = false;
  if (songStatus) songStatus.textContent = `Hear the ${currentLanguage} song of ${currentDeity} on YouTube anytime.`;
}

function speakDevotionalText(text, language, onEnd) {
  if (!text) return onEnd?.();
  const matchingVoice = findGenderLanguageVoice(language, currentGender) || findLanguageVoice(language);
  if (!matchingVoice) {
    playServerNarration(text, language, currentGender, onEnd);
    return;
  }
  window.speechSynthesis.cancel();
  if (typeof window.speechSynthesis.resume === "function") window.speechSynthesis.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageCodes[language] || "en-IN";
  utterance.voice = matchingVoice;
  utterance.rate = 0.78;
  utterance.pitch = currentGender === "female" ? 1.04 : 0.9;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

function finishMantraSequence(recognized) {
  mantraSequenceActive = false;
  mantraReciteBtn.disabled = false;
  mantraStopBtn.disabled = true;
  if (!recognized) {
    mantraStatus.innerHTML = "<span>✧</span> I could not hear the full mantra. Please try again.";
    return;
  }
  mantraStatus.innerHTML = "<span>✦</span> Wow, very good. Your Gayatri Mantra was heard.";
  if (hearGodSongBtn) hearGodSongBtn.disabled = false;
  if (songStatus) songStatus.textContent = `Your ${currentLanguage} ${currentDeity} song is ready.`;
  const encouragementByLanguage = {
    Tamil: "மிகவும் நன்று! நீங்கள் காயத்ரி மந்திரத்தை அழகாகச் சொன்னீர்கள்.",
    English: "Wow, very good. You repeated the Gayatri Mantra beautifully.",
    Hindi: "बहुत अच्छा! आपने गायत्री मंत्र बहुत सुंदर ढंग से दोहराया।",
    Telugu: "చాలా బాగుంది! మీరు గాయత్రీ మంత్రాన్ని ఎంతో అందంగా పఠించారు.",
    Malayalam: "വളരെ നല്ലത്! നിങ്ങൾ ഗായത്രി മന്ത്രം വളരെ മനോഹരമായി ചൊല്ലി.",
    Kannada: "ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ! ನೀವು ಗಾಯತ್ರಿ ಮಂತ್ರವನ್ನು ಬಹಳ ಸುಂದರವಾಗಿ ಪಠಿಸಿದ್ದೀರಿ.",
  };
  const encouragement = encouragementByLanguage[currentLanguage] || encouragementByLanguage.English;
  speakDevotionalText(`${encouragement} ${currentConclusion}`, currentLanguage, () => {
    mantraStatus.innerHTML = "<span>✦</span> Good thought received. You may now hear God’s song.";
  });
}

function startMantraRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    finishMantraSequence(true);
    return;
  }
  mantraRecognitionFinal = new Recognition();
  mantraRecognitionFinal.lang = languageCodes[currentLanguage] || "en-IN";
  mantraRecognitionFinal.continuous = false;
  mantraRecognitionFinal.interimResults = true;
  mantraRecognitionFinal.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ").trim();
    mantraTranscript.textContent = transcript ? `Heard: “${transcript}”` : "Listening…";
    if (event.results[event.results.length - 1].isFinal) finishMantraSequence(transcript.length >= 10);
  };
  mantraRecognitionFinal.onerror = () => finishMantraSequence(false);
  mantraRecognitionFinal.onend = () => { if (mantraSequenceActive) finishMantraSequence(false); };
  mantraRecognitionFinal.start();
}

const turnPromptByLanguage = {
  Tamil: "இப்போது உங்கள் முறை. தயவுசெய்து காயத்ரி மந்திரத்தைச் சொல்லுங்கள்.",
  English: "Now it is your turn. Please recite the Gayatri Mantra.",
  Hindi: "अब आपकी बारी है। कृपया गायत्री मंत्र का जाप करें।",
  Telugu: "ఇప్పుడు మీ వంతు. దయచేసి గాయత్రీ మంత్రాన్ని జపించండి.",
  Malayalam: "ഇപ്പോൾ നിങ്ങളുടെ അവസരമാണ്. ദയവായി ഗായത്രി മന്ത്രം ചൊല്ലുക.",
  Kannada: "ಈಗ ನಿಮ್ಮ ಸರದಿ. ದಯವಿಟ್ಟು ಗಾಯತ್ರಿ ಮಂತ್ರವನ್ನು ಪಠಿಸಿ.",
};

function speakTurnPromptAndListen() {
  if (!mantraSequenceActive) return;
  const prompt = turnPromptByLanguage[currentLanguage] || turnPromptByLanguage.English;
  speakDevotionalText(prompt, currentLanguage, () => {
    if (!mantraSequenceActive) return;
    mantraStatus.textContent = prompt;
    startMantraRecognition();
  });
}

function beginGayatriSequence() {
  if (mantraSequenceActive) return;
  mantraSequenceActive = true;
  mantraReciteBtn.disabled = true;
  mantraStopBtn.disabled = false;
  mantraStatus.innerHTML = "<span>ॐ</span> Listen to your deity’s Gayatri Mantra…";
  speakDevotionalText(slowMantraText(), currentLanguage, () => {
    if (!mantraSequenceActive) return;
    speakTurnPromptAndListen();
  });
}

function stopGayatriSequence() {
  mantraSequenceActive = false;
  mantraRecognitionFinal?.stop?.();
  if (generatedNarrationAudio) {
    generatedNarrationAudio.onended = null;
    generatedNarrationAudio.onerror = null;
    generatedNarrationAudio.pause();
    generatedNarrationAudio.currentTime = 0;
  }
  window.speechSynthesis.cancel();
  mantraReciteBtn.disabled = false;
  mantraStopBtn.disabled = true;
  mantraStatus.innerHTML = "<span>✧</span> Mantra listening stopped.";
}

if (mantraReciteBtn) mantraReciteBtn.addEventListener("click", beginGayatriSequence);
if (mantraReplayBtn) mantraReplayBtn.addEventListener("click", () => {
  stopGayatriSequence();
  beginGayatriSequence();
});
if (mantraStopBtn) mantraStopBtn.addEventListener("click", stopGayatriSequence);

const previousApplyStoryForMantra = applyStory;
applyStory = function(data) {
  previousApplyStoryForMantra(data);
  updateMantraStep();
};


let generatedNarrationAudio = null;
let generatedNarrationUrl = null;
let narrationAudioContext = null;
const narrationCache = new Map();

function unlockNarrationAudio() {
  try {
    narrationAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    narrationAudioContext.resume();
  } catch (error) {
    console.info("Audio unlock is unavailable", error);
  }
}

async function playServerNarration(text, language, gender, onEnd) {
  if (generatedNarrationAudio) {
    generatedNarrationAudio.onended = null;
    generatedNarrationAudio.onerror = null;
    generatedNarrationAudio.pause();
    generatedNarrationAudio.currentTime = 0;
  }
  try {
    const cacheKey = `${language}|${gender}|${text}`;
    generatedNarrationUrl = narrationCache.get(cacheKey);
    if (!generatedNarrationUrl) {
      const response = await fetch("/speech-audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language, gender }) });
      if (!response.ok) throw new Error("Speech audio request failed");
      const blob = await response.blob();
      generatedNarrationUrl = URL.createObjectURL(blob);
      narrationCache.set(cacheKey, generatedNarrationUrl);
    }
    generatedNarrationAudio = new Audio(generatedNarrationUrl);
    generatedNarrationAudio.volume = 1;
    try {
      narrationAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const source = narrationAudioContext.createMediaElementSource(generatedNarrationAudio);
      const gain = narrationAudioContext.createGain();
      gain.gain.value = 1.8;
      source.connect(gain).connect(narrationAudioContext.destination);
      await narrationAudioContext.resume();
    } catch (audioBoostError) {
      console.info("Using normal narration volume", audioBoostError);
    }
    generatedNarrationAudio.onplay = () => { setTalking(true); voiceStatus.textContent = `${currentDeity} is speaking in ${language}`; };
    generatedNarrationAudio.onended = () => { setTalking(false); voiceStatus.textContent = "The blessing has been received."; onEnd?.(); };
    generatedNarrationAudio.onerror = () => { setTalking(false); voiceStatus.textContent = `Speech audio is unavailable for ${language}.`; onEnd?.(); };
    await generatedNarrationAudio.play();
  } catch (error) {
    console.error("Generated narration failed", error);
    setTalking(false);
    if (text === `${currentStory} ${currentConclusion}` && currentUtterance) {
      currentUtterance.lang = languageCodes[language] || "en-IN";
      currentUtterance.voice = getPreferredVoice(language, gender);
      currentUtterance.onstart = () => { setTalking(true); voiceStatus.textContent = `${currentDeity} is speaking in ${language}`; };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(currentUtterance);
    } else {
      voiceStatus.textContent = `Generated narration is unavailable for ${language}.`;
      onEnd?.();
    }
  }
}
