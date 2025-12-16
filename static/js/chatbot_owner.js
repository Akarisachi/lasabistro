window.addEventListener('DOMContentLoaded', () => {
    const openAiBtn = document.getElementById('openAiBtn');
    const aiModal = document.getElementById('aiModal');
    const closeAiBtn = document.getElementById('closeAiBtn');
    const aiChatArea = document.getElementById('aiChatArea');
    const aiInput = document.getElementById('aiInput');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiAlertDot = document.getElementById('aiAlertDot');
    const aiMicBtn = document.getElementById('aiMicBtn');
    const aiVolumeBtn = document.getElementById('aiVolumeBtn');

    let recognition;
    let isListening = false;
    let welcomeShown = false;
    let voiceMuted = false;
    let currentUtterance = null;

    function scrollAiToBottom() { aiChatArea.scrollTop = aiChatArea.scrollHeight; }

    // -------------------
    // OPEN / CLOSE MODAL
    // -------------------
    openAiBtn?.addEventListener('click', async () => {
        aiModal.style.display = 'block';
        await ensureWelcomeMessage();
    });

    closeAiBtn?.addEventListener('click', () => aiModal.style.display = 'none');

    // -------------------
    // WELCOME MESSAGE
    // -------------------
    async function ensureWelcomeMessage() {
        if (welcomeShown) return;
        welcomeShown = true;
        appendAiMessage('assistant', 'Hello! I can help with sales summaries, popular dishes, inventory alerts, or promotions. Ask me anything about the restaurant.');
        const alertRes = await fetch(`${API_URL}/ai/inventory_alerts`);
        const alertData = await alertRes.json();

        if (alertData.count > 0) {
            appendAiMessage(
                'assistant',
                `🚨 Inventory Alert:\n` +
                alertData.items.map(i =>
                    `⚠️ ${i.name} (${i.quantity}${i.unit} left)`
                ).join('\n')
            );
        }

    }

    // -------------------
    // APPEND CHAT MESSAGE
    // -------------------
    function appendAiMessage(role, text) {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '10px';
        wrap.style.display = 'flex';
        wrap.style.flexDirection = role === 'user' ? 'row-reverse' : 'row';
        wrap.style.alignItems = 'flex-start';

        const bubble = document.createElement('div');
        bubble.style.padding = '10px';
        bubble.style.borderRadius = '12px';
        bubble.style.maxWidth = '80%';
        bubble.style.wordWrap = 'break-word';
        bubble.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
        bubble.style.whiteSpace = 'pre-wrap'; // keep newlines

        if (role === 'user') {
            bubble.style.background = '#0984e3';
            bubble.style.color = '#fff';
        } else {
            bubble.style.background = '#f1f1f1';
            bubble.style.color = '#222';
            // Highlight low inventory
            text = text.replace(/(Low inventory alert: .*?)(\n|$)/gi,
                `<span style="color:red;font-weight:bold;">$1</span>$2`);
        }

        bubble.innerHTML = text;
        wrap.appendChild(bubble);
        aiChatArea.appendChild(wrap);
        scrollAiToBottom();
    }

    function escapeHtml(s) {
        return (s + '').replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    // -------------------
    // SEND MESSAGE TO AI
    // -------------------
    async function sendToOwnerAI(message) {
        appendAiMessage('user', message);

        const loadingEl = document.createElement('div');
        loadingEl.style.opacity = '0.8';
        loadingEl.style.marginBottom = '10px';
        loadingEl.innerHTML = `<div style="text-align:left;">
            <span style="display:inline-block;background:#fff3cd;color:#856404;padding:8px;border-radius:8px;max-width:80%;">Thinking...</span>
        </div>`;
        aiChatArea.appendChild(loadingEl);
        scrollAiToBottom();

        try {
            const context = await getDashboardSnapshot();
            const payload = { message, context };
            const res = await fetch(`${API_URL}/ai/owner_chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            aiChatArea.removeChild(loadingEl);

            const reply = data.reply || 'No response from AI';
            appendAiMessage('assistant', reply);
            speak(reply);

        } catch (err) {
            aiChatArea.removeChild(loadingEl);
            appendAiMessage('assistant', 'Network error: ' + (err.message || err));
            console.error(err);
        }
    }

    async function getDashboardSnapshot() {
        try {
            const res = await fetch(`${API_URL}/dashboard_stats`);
            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            console.error("Failed to fetch dashboard snapshot:", err);
            return null;
        }
    }
    // -------------------
    // SEND BUTTON
    // -------------------
    aiSendBtn?.addEventListener('click', () => {
        const txt = aiInput.value.trim();
        if (!txt) return;
        aiInput.value = '';
        sendToOwnerAI(txt);
    });

    aiInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            aiSendBtn.click();
        }
    });

    // -------------------
    // TEXT-TO-SPEECH
    // -------------------
    // -------------------
    // TEXT-TO-SPEECH
    // -------------------
    function speak(text) {
        if (voiceMuted) return;
        if (currentUtterance) speechSynthesis.cancel(); // stop previous speech
        currentUtterance = new SpeechSynthesisUtterance(text);
        currentUtterance.lang = 'en-US';
        currentUtterance.onend = () => currentUtterance = null;
        speechSynthesis.speak(currentUtterance);
    }

    // Volume/mute button
    aiVolumeBtn?.addEventListener('click', () => {
        voiceMuted = !voiceMuted;
        aiVolumeBtn.innerText = voiceMuted ? '🔇' : '🔊';

        // Immediately stop any ongoing AI speech when muted
        if (voiceMuted && currentUtterance) {
            speechSynthesis.cancel();
            currentUtterance = null;
        }
    });


    // -------------------
    // VOICE RECOGNITION
    // -------------------
    function initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            console.warn('Speech recognition not supported.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = async (event) => {
            const lastResult = event.results[event.results.length - 1];
            if (!lastResult.isFinal) return;
            const transcript = lastResult[0].transcript.trim();
            if (!transcript) return;

            console.log("User said:", transcript);

            // Stop listening while processing AI response
            stopListening();
            await sendToOwnerAI(transcript);
        };

        recognition.onerror = (e) => console.error('Voice recognition error', e);
        recognition.onend = () => {
            if (isListening) recognition.start(); // auto-restart if still listening
        };
    }

    function startListening() {
        if (!recognition) return;
        if (currentUtterance) speechSynthesis.cancel(); // stop AI speech
        isListening = true;
        recognition.start();
        aiMicBtn.style.background = '#0984e3'; // mic active
    }

    function stopListening() {
        if (!recognition) return;
        isListening = false;
        recognition.stop();
        aiMicBtn.style.background = ''; // reset button
    }

    aiMicBtn?.addEventListener('click', () => {
        if (isListening) stopListening();
        else startListening();
    });

    // -------------------
    // INIT
    // -------------------
    initVoiceRecognition();
});