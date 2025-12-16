const chatbotModal = document.getElementById('chatbotModalBg');
const chatbotMessages = document.getElementById('chatbotMessages');
const chatbotInput = document.getElementById('chatbotInput');
const voiceBtn = document.getElementById('voiceBtn');
const muteBtn = document.getElementById('chatbotMuteBtn');

let isMuted = false;
let recognition;
let recognizing = false;
let currentUtterance = null;

// ----------------- OPEN/CLOSE -----------------
function openChatbot() { chatbotModal.style.display = 'flex'; }
function closeChatbot() {
    chatbotModal.style.display = 'none';
    if (currentUtterance) speechSynthesis.cancel(); // stop speaking when closing
}

// ----------------- MUTE -----------------
muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    if (isMuted && currentUtterance) speechSynthesis.cancel(); // stop current speech
});

// ----------------- APPEND MESSAGE -----------------
function appendMessage(msg, type = 'bot-message') {
    const div = document.createElement('div');
    div.className = 'message ' + type;

    // Convert line breaks to <br>
    div.innerHTML = msg
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); // bold support

    chatbotMessages.appendChild(div);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}


// ----------------- SEND MESSAGE -----------------
async function sendChatbotMessage() {
    const msg = chatbotInput.value.trim();
    if (!msg) return;

    appendMessage(msg, 'user-message');
    chatbotInput.value = '';

    const username = document.getElementById('greetingName')?.textContent || "";

    try {
        const res = await fetch('/customer_ai_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, username: username })
        });
        const data = await res.json();
        appendMessage(data.reply, 'bot-message');

        // Voice output
        if (!isMuted && 'speechSynthesis' in window) {
            currentUtterance = new SpeechSynthesisUtterance(data.reply);
            currentUtterance.onend = () => { currentUtterance = null; };
            speechSynthesis.speak(currentUtterance);
        }

    } catch (err) {
        appendMessage("⚠️ Error connecting to assistant.", 'bot-message');
    }
}

// ----------------- ENTER KEY -----------------
chatbotInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatbotMessage();
});

// ----------------- VOICE INPUT -----------------
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => { recognizing = true; voiceBtn.textContent = '🎙️...'; }
    recognition.onend = () => { recognizing = false; voiceBtn.textContent = '🎤'; }
    recognition.onerror = (e) => { recognizing = false; voiceBtn.textContent = '🎤'; }

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        appendMessage(transcript, 'user-message'); // display user voice input
        chatbotInput.value = transcript;
        sendChatbotMessage();
    };

    voiceBtn.addEventListener('click', () => {
        if (recognizing) recognition.stop();
        else recognition.start();
    });
} else {
    voiceBtn.disabled = true;
    voiceBtn.title = "Voice not supported";
}

