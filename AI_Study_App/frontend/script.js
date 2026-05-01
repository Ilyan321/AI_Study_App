// --- GLOBAL: Clear Session (must be global for HTML onclick handler)
function clearSession() {
    if (confirm('Clear conversation history and start a new session?')) {
        localStorage.removeItem('studyApp_sessionId');
        location.reload();
    }
}

// --- 1. System Initialization & State Management ---

function initializeApp() {
    // Guard: Wait for required libraries to be available
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined' || typeof hljs === 'undefined') {
        console.warn('Libraries still loading (marked, DOMPurify, hljs)... retrying in 500ms');
        setTimeout(initializeApp, 500);
        return;
    }

    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    let isProcessing = false;

    // Verify elements exist
    if (!chatContainer || !userInput || !sendBtn) {
        console.error('Required DOM elements not found!');
        return;
    }

    // Initialize Session ID (Crucial for Flowise Chat History)
    function initSession() {
        let sessionId = localStorage.getItem('studyApp_sessionId');
        if (!sessionId) {
            sessionId = 'session_' + crypto.randomUUID();
            localStorage.setItem('studyApp_sessionId', sessionId);
            console.log('New Session Initialized:', sessionId);
        }
        return sessionId;
    }
    const currentSessionId = initSession();

    // Set initial timestamp
    const timeStamp = document.querySelector('.time-stamp');
    if (timeStamp) {
        timeStamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Configure Marked.js & Highlight.js integration
    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
    });

    // --- 2. UI Interaction Logic ---

    // Auto-resize textarea seamlessly
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        let newHeight = this.scrollHeight;
        this.style.height = (newHeight < 200 ? newHeight : 200) + 'px';
        if (newHeight >= 200) this.style.overflowY = 'auto';
        else this.style.overflowY = 'hidden';

        if (this.value === '') {
            this.style.height = 'auto';
            this.style.overflowY = 'hidden';
        }
    });

    // Enter key: submit on Enter alone, allow Shift+Enter for newline
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Send button click handler
    sendBtn.addEventListener('click', handleSend);

    async function handleSend() {
        const text = userInput.value.trim();
        if (!text || isProcessing) return;

        // Lock UI
        isProcessing = true;
        sendBtn.disabled = true;
        userInput.disabled = true;

        // Render User Message
        appendUserMessage(text);

        // Clear Input
        userInput.value = '';
        userInput.style.height = 'auto';

        // Show "Thinking" State
        const loadingId = showRoutingIndicator();

        try {
            const response = await callBackendAPI(text, currentSessionId);

            // Remove loader and render AI response
            removeElement(loadingId);

            const markdownText =
                response?.text ||
                response?.data?.text ||
                response?.data?.output ||
                response?.data?.response ||
                response?.data?.answer ||
                response?.data?.message ||
                response?.output ||
                response?.response ||
                response?.answer ||
                response?.message ||
                JSON.stringify(response?.data || response, null, 2);

            const agentName =
                response?.agent ||
                response?.data?.agent ||
                response?.data?.agentName ||
                'AI Router';

            appendAIMessage(markdownText, agentName);
        } catch (error) {
            removeElement(loadingId);
            appendAIMessage('**System Error:** Unable to connect to the Multi-Agent Router. Please check your backend connection.', 'System Error');
            console.error(error);
        } finally {
            // Unlock UI
            isProcessing = false;
            sendBtn.disabled = false;
            userInput.disabled = false;
            userInput.focus();
        }
    }

    // --- 3. DOM Rendering Functions ---

    function getTimestamp() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function appendUserMessage(text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-end w-full animate-[fadeIn_0.3s_ease-out]';

        const label = document.createElement('div');
        label.className = 'flex items-center gap-2 mb-1.5 mr-1';
        label.innerHTML = `
            <span class="text-[10px] text-gray-600 font-mono">${getTimestamp()}</span>
            <span class="text-[11px] uppercase tracking-wider font-semibold text-gray-400">You</span>
            <i class="ph-fill ph-user-circle text-gray-400 text-sm"></i>
        `;

        const bubble = document.createElement('div');
        bubble.className = 'user-bubble text-white p-4 sm:p-5 rounded-2xl rounded-tr-sm max-w-[90%] md:max-w-[75%] font-normal text-sm sm:text-[15px] leading-relaxed';
        bubble.textContent = text; // Safe text rendering

        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        chatContainer.appendChild(wrapper);
        scrollToBottom();
    }

    function showRoutingIndicator() {
        const id = 'routing-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.id = id;
        wrapper.className = 'flex flex-col items-start w-full animate-[fadeIn_0.3s_ease-out]';

        const label = document.createElement('div');
        label.className = 'flex items-center gap-2 mb-1.5 ml-1';
        label.innerHTML = `
            <i class="ph-duotone ph-arrows-split text-[#0ea5e9] text-sm animate-pulse"></i>
            <span class="text-[11px] uppercase tracking-wider font-semibold text-[#0ea5e9]">Router analyzing intent</span>
        `;

        const bubble = document.createElement('div');
        bubble.className = 'glass-panel p-4 rounded-2xl rounded-tl-sm flex items-center justify-center min-w-[100px]';

        const loader = document.createElement('div');
        loader.className = 'routing-indicator';
        loader.innerHTML = '<div class="routing-dot"></div><div class="routing-dot"></div><div class="routing-dot"></div>';

        bubble.appendChild(loader);
        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        chatContainer.appendChild(wrapper);
        scrollToBottom();

        return id;
    }

    function appendAIMessage(markdownText, agentName) {
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-start w-full animate-[fadeIn_0.4s_ease-out]';

        // Determine agent icon and color based on name
        let iconStr = '<i class="ph-fill ph-robot text-[#0ea5e9] text-sm"></i>';
        let colorClass = 'text-[#0ea5e9]';
        if (agentName.includes('Tester')) { iconStr = '<i class="ph-fill ph-code text-purple-400 text-sm"></i>'; colorClass = 'text-purple-400'; }
        if (agentName.includes('Planner')) { iconStr = '<i class="ph-fill ph-table text-emerald-400 text-sm"></i>'; colorClass = 'text-emerald-400'; }

        const label = document.createElement('div');
        label.className = 'flex items-center gap-2 mb-1.5 ml-1';
        label.innerHTML = `
            ${iconStr}
            <span class="text-[11px] uppercase tracking-wider font-semibold ${colorClass}">${agentName}</span>
            <span class="text-[10px] text-gray-600 font-mono">${getTimestamp()}</span>
        `;

        const bubble = document.createElement('div');
        bubble.className = 'glass-panel p-5 sm:p-6 rounded-2xl rounded-tl-sm w-full max-w-[95%] md:max-w-[85%] markdown-body overflow-hidden';

        // 1. Parse Markdown
        const rawHtml = marked.parse(markdownText);
        // 2. Sanitize HTML for Security (Crucial for production)
        const cleanHtml = DOMPurify.sanitize(rawHtml);
        bubble.innerHTML = cleanHtml;

        // 3. Post-process code blocks for UI polish (Copy Buttons)
        const preTags = bubble.querySelectorAll('pre');
        preTags.forEach(pre => {
            const codeElement = pre.querySelector('code');
            const langClass = codeElement ? Array.from(codeElement.classList).find(c => c.startsWith('language-')) : '';
            const langLabel = langClass ? langClass.replace('language-', '') : 'Code';

            const header = document.createElement('div');
            header.className = 'flex justify-between items-center bg-[#1e1e1e] border-b border-[#2a2a2a] -mx-5 -mt-5 mb-4 px-4 py-2 rounded-t-lg select-none';
            header.innerHTML = `
                <span class="text-[10px] text-gray-400 font-mono uppercase tracking-wider">${langLabel}</span>
                <button class="text-[11px] text-gray-400 hover:text-[#0ea5e9] transition-colors flex items-center gap-1.5 copy-btn py-1 px-2 rounded hover:bg-[#2a2a2a]">
                    <i class="ph ph-copy"></i> Copy
                </button>
            `;
            pre.insertBefore(header, pre.firstChild);

            const copyBtn = header.querySelector('.copy-btn');
            copyBtn.addEventListener('click', () => {
                const code = codeElement.innerText;
                navigator.clipboard.writeText(code).then(() => {
                    copyBtn.innerHTML = '<i class="ph-bold ph-check text-emerald-500"></i> <span class="text-emerald-500">Copied</span>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="ph ph-copy"></i> Copy';
                    }, 2000);
                });
            });
        });

        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        chatContainer.appendChild(wrapper);
        scrollToBottom();
    }

    function removeElement(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    // --- 4. Backend API ---
    async function callBackendAPI(userText, sessionId) {
        // Always read session from localStorage at send-time to avoid stale state.
        const persistedSessionId = localStorage.getItem('studyApp_sessionId') || sessionId;

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: userText,
                sessionId: persistedSessionId
            })
        });

        if (!res.ok) {
            let detail = `HTTP ${res.status}`;
            try {
                const err = await res.json();
                detail = err.detail || JSON.stringify(err);
            } catch (_) {
                detail = await res.text();
            }
            throw new Error(detail);
        }

        return res.json();
    }
}

// Ensure DOM is ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already loaded
    initializeApp();
}
