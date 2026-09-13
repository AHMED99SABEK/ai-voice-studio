// Initialize Mermaid
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'Plus Jakarta Sans, sans-serif'
});

// Anonymous Multi-User Isolation (persisted in localStorage)
let userId = localStorage.getItem('ai_voice_user_id');
if (!userId) {
    userId = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('ai_voice_user_id', userId);
}

// --- Bring Your Own Keys (BYOK) & Model Presets ---
const DEFAULT_SETTINGS = {
    llm_preset: 'deepseek',
    llm_endpoint: 'https://api.deepseek.com/v1',
    llm_model: 'deepseek-chat',
    llm_key: '',
    deepgram_key: '',
    cartesia_key: '',
    cartesia_voice: '694f9389-aac1-45b6-b726-9d9369183238',
    browser_voice: '',
    speech_pause_tolerance: 1500,
    tts_provider: 'cartesia',
    listening_mode: 'auto'
};

const LLM_PRESETS = {
    deepseek: { endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    groq: { endpoint: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
    custom: { endpoint: '', model: '' }
};

function getSettings() {
    try {
        const saved = localStorage.getItem('ai_voice_settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(s) {
    localStorage.setItem('ai_voice_settings', JSON.stringify(s));
    updateSettingsPillStatus();
}

// Session & Voice Engine State
let currentSessionId = null;
let currentSessionTitle = "Voice Session";
let currentVisuals = [];
let sessionMessages = [];
let isCallActive = false;
let sessionToRename = null;

// Audio & WebSockets
let audioContext = null;
let micStream = null;
let scriptProcessor = null;
let isStreamingAudio = false;
let deepgramWs = null;
let cartesiaWs = null;
let activeAudioSources = [];
let nextAudioPlayTime = 0;
let currentContextId = null;
let isCartesiaContextActive = false;
let currentAbortController = null;

// Timer State
let timerInterval = null;
let remainingSeconds = 600; // 10 minutes default
let totalDurationSeconds = 600;
let isTimerPaused = false;
let sessionStartTime = null;
let sessionPausedTotalMs = 0;
let sessionPauseStartTime = null;

// DOM Elements - Navigation & Sidebar
const sidebar = document.getElementById('sidebar');
const sessionList = document.getElementById('session-list');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');

// Screens
const setupScreen = document.getElementById('setup-screen');
const sessionScreen = document.getElementById('session-screen');
const endScreen = document.getElementById('end-screen');

// Setup Screen Form
const sessionTitleInput = document.getElementById('session-title-input');
const providerSelect = document.getElementById('provider-select');
const systemPromptInput = document.getElementById('system-prompt-input');
const presetChips = document.getElementById('preset-chips');
const joinBtn = document.getElementById('join-btn');
const openSettingsSetupBtn = document.getElementById('open-settings-setup-btn');
const keysStatusText = document.getElementById('keys-status-text');
const customizeModelLink = document.getElementById('customize-model-link');
const savePersonaBtn = document.getElementById('save-persona-btn');
const myPersonasSection = document.getElementById('my-personas-section');
const myPersonasChips = document.getElementById('my-personas-chips');

// Active Session Top Bar
const activeSessionTitle = document.getElementById('active-session-title');
const renameActiveBtn = document.getElementById('rename-active-btn');
const activeProviderTag = document.getElementById('active-provider-tag');
const timerDisplay = document.getElementById('timer-display');
const timerPhase = document.getElementById('timer-phase');
const sessionProgress = document.getElementById('session-progress');

// Active Session Controls
const startCallBtn = document.getElementById('start-call-btn');
const commitNowBtn = document.getElementById('commit-now-btn');
const pauseBtn = document.getElementById('pause-btn');
const extendBtn = document.getElementById('extend-btn');
const visualsToggleBtn = document.getElementById('visuals-toggle-btn');
const endBtn = document.getElementById('end-btn');

// Main Conversation Area
const transcriptMessages = document.getElementById('transcript-messages');
const speechActivityIndicator = document.getElementById('speech-activity-indicator');
const visualCanvas = document.getElementById('visual-canvas');
const canvasBody = document.getElementById('canvas-body');
const closeCanvasBtn = document.getElementById('close-canvas-btn');

// End Screen Elements
const endSessionTitle = document.getElementById('end-session-title');
const endMetaTags = document.getElementById('end-meta-tags');
const summaryContent = document.getElementById('summary-content');
const restartBtn = document.getElementById('restart-btn');
const exportBtn = document.getElementById('export-btn');
const deleteSessionBtn = document.getElementById('delete-session-btn');

// Rename Modal
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const cancelRenameBtn = document.getElementById('cancel-rename-btn');
const confirmRenameBtn = document.getElementById('confirm-rename-btn');

// Settings Modal Elements
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsLlmPreset = document.getElementById('settings-llm-preset');
const settingsLlmEndpoint = document.getElementById('settings-llm-endpoint');
const settingsLlmModel = document.getElementById('settings-llm-model');
const settingsLlmKey = document.getElementById('settings-llm-key');
const settingsDeepgramKey = document.getElementById('settings-deepgram-key');
const settingsPauseTolerance = document.getElementById('settings-pause-tolerance');
const settingsCartesiaKey = document.getElementById('settings-cartesia-key');
const settingsCartesiaPreset = document.getElementById('settings-cartesia-preset');
const settingsCartesiaVoice = document.getElementById('settings-cartesia-voice');
const settingsTtsProvider = document.getElementById('settings-tts-provider');
const cartesiaConfigGroup = document.getElementById('cartesia-config-group');
const settingsBrowserVoice = document.getElementById('settings-browser-voice');
const browserConfigGroup = document.getElementById('browser-config-group');
const testVoiceBtn = document.getElementById('test-voice-btn');
const testVoiceStatus = document.getElementById('test-voice-status');
const resetSettingsBtn = document.getElementById('reset-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsListeningMode = document.getElementById('settings-listening-mode');
const listeningModeToggle = document.getElementById('listening-mode-toggle');

function populateBrowserVoices() {
    if (!('speechSynthesis' in window) || !settingsBrowserVoice) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    const saved = getSettings().browser_voice || '';
    settingsBrowserVoice.innerHTML = '';

    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    const otherVoices = voices.filter(v => !v.lang.startsWith('en'));
    const all = [...enVoices, ...otherVoices];

    all.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})${v.default ? ' — Default' : ''}`;
        if (saved ? v.name === saved : (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Jenny') || v.name.includes('Zira'))) {
            opt.selected = true;
        }
        settingsBrowserVoice.appendChild(opt);
    });
}

function updateTtsGroupVisibility() {
    const isCartesia = (settingsTtsProvider?.value || 'cartesia') === 'cartesia';
    if (cartesiaConfigGroup) {
        cartesiaConfigGroup.style.display = isCartesia ? 'block' : 'none';
    }
    if (browserConfigGroup) {
        browserConfigGroup.style.display = isCartesia ? 'none' : 'block';
    }
    if (!isCartesia) {
        populateBrowserVoices();
    }
}

// --- Settings Modal Logic ---
function updateSettingsPillStatus() {
    const s = getSettings();
    const needsCartesia = (s.tts_provider || 'cartesia') === 'cartesia';
    const hasKeys = !!(s.deepgram_key && (!needsCartesia || s.cartesia_key));
    if (keysStatusText) {
        if (hasKeys) {
            const voiceLabel = needsCartesia ? 'Cartesia' : 'Free Voice';
            keysStatusText.textContent = `Keys: Ready (${voiceLabel}, ${s.llm_model || s.llm_preset})`;
            openSettingsSetupBtn?.classList.add('configured');
        } else {
            keysStatusText.textContent = 'Keys: Configure API Keys';
            openSettingsSetupBtn?.classList.remove('configured');
        }
    }
}

function openSettingsModal() {
    const s = getSettings();
    settingsLlmPreset.value = s.llm_preset || 'deepseek';
    settingsLlmEndpoint.value = s.llm_endpoint || '';
    settingsLlmModel.value = s.llm_model || '';
    settingsLlmKey.value = s.llm_key || '';
    settingsDeepgramKey.value = s.deepgram_key || '';
    if (settingsPauseTolerance) settingsPauseTolerance.value = s.speech_pause_tolerance || 1500;
    if (settingsListeningMode) settingsListeningMode.value = s.listening_mode || 'auto';
    if (settingsTtsProvider) settingsTtsProvider.value = s.tts_provider || 'cartesia';
    settingsCartesiaKey.value = s.cartesia_key || '';
    
    const voiceId = s.cartesia_voice || '694f9389-aac1-45b6-b726-9d9369183238';
    if (settingsCartesiaVoice) settingsCartesiaVoice.value = voiceId;
    if (settingsCartesiaPreset) {
        const match = Array.from(settingsCartesiaPreset.options).find(o => o.value === voiceId);
        if (match) {
            settingsCartesiaPreset.value = voiceId;
        } else {
            settingsCartesiaPreset.value = 'custom';
        }
    }

    populateBrowserVoices();
    if (settingsBrowserVoice && s.browser_voice) {
        settingsBrowserVoice.value = s.browser_voice;
    }

    updateTtsGroupVisibility();
    settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
    settingsModal.style.display = 'none';
    if (testVoiceStatus) testVoiceStatus.textContent = '';
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
if (openSettingsSetupBtn) openSettingsSetupBtn.addEventListener('click', openSettingsModal);
if (customizeModelLink) customizeModelLink.addEventListener('click', openSettingsModal);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);

if (settingsTtsProvider) {
    settingsTtsProvider.addEventListener('change', () => {
        updateTtsGroupVisibility();
        saveSettings(readSettingsFromForm());
        updateSettingsPillStatus();
    });
}

if (settingsCartesiaPreset) {
    settingsCartesiaPreset.addEventListener('change', () => {
        const val = settingsCartesiaPreset.value;
        if (val !== 'custom') {
            settingsCartesiaVoice.value = val;
        }
        saveSettings(readSettingsFromForm());
    });
}

if (settingsCartesiaVoice) {
    settingsCartesiaVoice.addEventListener('input', () => {
        const val = settingsCartesiaVoice.value.trim();
        const match = Array.from(settingsCartesiaPreset.options).find(o => o.value === val);
        if (match) {
            settingsCartesiaPreset.value = val;
        } else {
            settingsCartesiaPreset.value = 'custom';
        }
    });
}

// Voice Test Preview Button
let testAudioObj = null;
if (testVoiceBtn) {
    testVoiceBtn.addEventListener('click', async () => {
        const s = readSettingsFromForm();
        if (testVoiceStatus) testVoiceStatus.textContent = 'Playing test audio...';

        if (s.tts_provider === 'browser') {
            if (!('speechSynthesis' in window)) {
                if (testVoiceStatus) testVoiceStatus.textContent = 'Browser voice not supported.';
                return;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance("Hello! This is a preview of the voice you selected.");
            utterance.rate = 1.05;
            const voices = window.speechSynthesis.getVoices();
            const picked = voices.find(v => v.name === s.browser_voice);
            if (picked) utterance.voice = picked;
            utterance.onend = () => {
                if (testVoiceStatus) testVoiceStatus.textContent = 'Preview finished.';
                setTimeout(() => { if (testVoiceStatus) testVoiceStatus.textContent = ''; }, 3000);
            };
            utterance.onerror = () => {
                if (testVoiceStatus) testVoiceStatus.textContent = 'Voice preview error.';
            };
            window.speechSynthesis.speak(utterance);
        } else {
            if (!s.cartesia_key) {
                if (testVoiceStatus) testVoiceStatus.textContent = 'Enter your Cartesia key above first.';
                setTimeout(() => { if (testVoiceStatus) testVoiceStatus.textContent = ''; }, 3500);
                return;
            }
            try {
                if (testAudioObj) {
                    testAudioObj.pause();
                    testAudioObj = null;
                }
                const res = await fetch('https://api.cartesia.ai/tts/bytes', {
                    method: 'POST',
                    headers: {
                        'Cartesia-Version': '2024-06-10',
                        'X-API-Key': s.cartesia_key,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model_id: 'sonic-3.6',
                        transcript: 'Hello! I am your AI assistant. How does my voice sound to you?',
                        voice: { mode: 'id', id: s.cartesia_voice || '694f9389-aac1-45b6-b726-9d9369183238' },
                        output_format: { container: 'wav', sample_rate: 24000, encoding: 'pcm_s16le' }
                    })
                });
                if (!res.ok) {
                    const err = await res.text();
                    throw new Error(err || `Status ${res.status}`);
                }
                const blob = await res.blob();
                testAudioObj = new Audio(URL.createObjectURL(blob));
                testAudioObj.play();
                testAudioObj.onended = () => {
                    if (testVoiceStatus) testVoiceStatus.textContent = 'Preview finished.';
                    setTimeout(() => { if (testVoiceStatus) testVoiceStatus.textContent = ''; }, 3000);
                };
            } catch (err) {
                console.error('Test voice error:', err);
                if (testVoiceStatus) testVoiceStatus.textContent = 'Cartesia error (check key / credits).';
                setTimeout(() => { if (testVoiceStatus) testVoiceStatus.textContent = ''; }, 4000);
            }
        }
    });
}

// Settings Tab Navigation
document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(btn.dataset.tab);
        if (pane) pane.classList.add('active');
    });
});

// Toggle password visibility
document.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    });
});

// Preset selection sync
if (settingsLlmPreset) {
    settingsLlmPreset.addEventListener('change', () => {
        const val = settingsLlmPreset.value;
        if (val !== 'custom' && LLM_PRESETS[val]) {
            settingsLlmEndpoint.value = LLM_PRESETS[val].endpoint;
            settingsLlmModel.value = LLM_PRESETS[val].model;
        }
    });
}

if (providerSelect) {
    providerSelect.addEventListener('change', () => {
        const val = providerSelect.value;
        if (val !== 'custom' && LLM_PRESETS[val]) {
            const s = getSettings();
            s.llm_preset = val;
            s.llm_endpoint = LLM_PRESETS[val].endpoint;
            s.llm_model = LLM_PRESETS[val].model;
            saveSettings(s);
        }
    });
}

function readSettingsFromForm() {
    return {
        llm_preset: settingsLlmPreset?.value || 'deepseek',
        llm_endpoint: settingsLlmEndpoint?.value.trim() || '',
        llm_model: settingsLlmModel?.value.trim() || '',
        llm_key: settingsLlmKey?.value.trim() || '',
        deepgram_key: settingsDeepgramKey?.value.trim() || '',
        speech_pause_tolerance: parseInt(settingsPauseTolerance?.value) || 1500,
        tts_provider: settingsTtsProvider?.value || 'cartesia',
        cartesia_key: settingsCartesiaKey?.value.trim() || '',
        cartesia_voice: settingsCartesiaVoice?.value.trim() || '694f9389-aac1-45b6-b726-9d9369183238',
        browser_voice: settingsBrowserVoice?.value || '',
        listening_mode: settingsListeningMode?.value || 'auto'
    };
}

// Auto-save on input or change
[settingsLlmPreset, settingsLlmEndpoint, settingsLlmModel, settingsLlmKey, settingsDeepgramKey, settingsPauseTolerance, settingsListeningMode, settingsTtsProvider, settingsCartesiaKey, settingsCartesiaVoice, settingsBrowserVoice].forEach(input => {
    if (input) {
        input.addEventListener('input', () => {
            saveSettings(readSettingsFromForm());
            updateListeningModeUI();
        });
        input.addEventListener('change', () => {
            saveSettings(readSettingsFromForm());
            updateListeningModeUI();
        });
    }
});

// Save Settings button
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        const updated = readSettingsFromForm();
        saveSettings(updated);
        
        if (providerSelect && updated.llm_preset) {
            providerSelect.value = updated.llm_preset;
        }
        
        closeSettingsModal();
    });
}

// Reset Settings
if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
        if (confirm("Reset all credentials and endpoint settings to defaults?")) {
            saveSettings(DEFAULT_SETTINGS);
            openSettingsModal();
        }
    });
}

// --- Preset Role Chips ---
if (presetChips) {
    presetChips.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            myPersonasChips?.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            systemPromptInput.value = chip.dataset.prompt;
        });
    });
}

// --- User Personas ---
function getPersonas() {
    try {
        return JSON.parse(localStorage.getItem('ai_voice_personas') || '[]');
    } catch (e) {
        return [];
    }
}

function savePersonaToStorage(name, prompt) {
    const personas = getPersonas();
    personas.push({ id: Date.now().toString(), name, prompt });
    localStorage.setItem('ai_voice_personas', JSON.stringify(personas));
}

function deletePersonaFromStorage(id) {
    const personas = getPersonas().filter(p => p.id !== id);
    localStorage.setItem('ai_voice_personas', JSON.stringify(personas));
}

function renderPersonas() {
    if (!myPersonasChips || !myPersonasSection) return;
    const personas = getPersonas();
    myPersonasChips.innerHTML = '';

    if (personas.length === 0) {
        myPersonasSection.style.display = 'none';
        return;
    }

    myPersonasSection.style.display = 'block';

    personas.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'chip persona-chip';
        chip.title = p.prompt;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'persona-chip-name';
        nameSpan.textContent = p.name;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'persona-chip-delete';
        deleteBtn.title = 'Delete persona';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete persona "${p.name}"?`)) {
                deletePersonaFromStorage(p.id);
                renderPersonas();
            }
        });

        chip.appendChild(nameSpan);
        chip.appendChild(deleteBtn);

        chip.addEventListener('click', () => {
            presetChips?.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            myPersonasChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            systemPromptInput.value = p.prompt;
        });

        myPersonasChips.appendChild(chip);
    });
}

// Save as Persona button
if (savePersonaBtn) {
    savePersonaBtn.addEventListener('click', () => {
        const promptText = systemPromptInput?.value?.trim();
        if (!promptText) {
            alert('Please type a system prompt first before saving as a persona.');
            return;
        }
        const name = window.prompt('Enter a name for this persona:', '');
        if (name === null) return; // cancelled
        const trimmedName = name.trim();
        if (!trimmedName) {
            alert('Please enter a persona name.');
            return;
        }
        savePersonaToStorage(trimmedName, promptText);
        renderPersonas();
    });
}

// Load personas on startup
renderPersonas();

// --- Session Persistence (Cloudflare D1 + LocalStorage Fallback) ---
function getLocalSessions() {
    try {
        return JSON.parse(localStorage.getItem('ai_voice_sessions') || '[]');
    } catch (e) {
        return [];
    }
}

function saveLocalSessions(sessions) {
    localStorage.setItem('ai_voice_sessions', JSON.stringify(sessions));
}

async function fetchSessions() {
    let sessions = [];
    try {
        const res = await fetch('/api/sessions', {
            headers: { 'X-User-Id': userId }
        });
        if (res.ok) {
            sessions = await res.json();
        } else {
            sessions = getLocalSessions();
        }
    } catch (e) {
        sessions = getLocalSessions();
    }

    sessionList.innerHTML = '';
    if (!Array.isArray(sessions) || sessions.length === 0) {
        sessionList.innerHTML = '<div class="loading-history">No past conversations</div>';
        return;
    }
    
    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item';
        if (currentSessionId === s.id) item.classList.add('active');
        
        const dateStr = s.created_at ? new Date(s.created_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        
        item.innerHTML = `
            <div class="session-item-content">
                <span class="session-item-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
                <span class="session-item-date">${dateStr}</span>
            </div>
            <div class="session-item-actions">
                <button class="mini-icon-btn rename-btn" title="Rename Session">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="mini-icon-btn delete-btn" title="Delete Session">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        
        item.querySelector('.session-item-content').addEventListener('click', () => loadSessionHistory(s.id));
        item.querySelector('.rename-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openRenameModal(s.id, s.title);
        });
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(s.id, s.title);
        });
        
        sessionList.appendChild(item);
    });
}

async function deleteSession(id, title) {
    if (!confirm(`Are you sure you want to delete "${title || 'this session'}"? This action cannot be undone.`)) {
        return;
    }
    try {
        await fetch(`/api/sessions/${id}`, {
            method: 'DELETE',
            headers: { 'X-User-Id': userId }
        });
    } catch (e) {}

    const local = getLocalSessions().filter(s => s.id !== id);
    saveLocalSessions(local);

    if (currentSessionId === id) {
        currentSessionId = null;
        endScreen.classList.remove('active');
        sessionScreen.classList.remove('active');
        setupScreen.classList.add('active');
    }
    await fetchSessions();
}

async function loadSessionHistory(id) {
    let data = null;
    try {
        const res = await fetch(`/api/sessions/${id}`, {
            headers: { 'X-User-Id': userId }
        });
        if (res.ok) {
            data = await res.json();
        } else {
            data = getLocalSessions().find(s => s.id === id);
        }
    } catch (e) {
        data = getLocalSessions().find(s => s.id === id);
    }

    if (!data) {
        console.warn('Session history not found for id:', id);
        return;
    }
    
    currentSessionId = id;
    setupScreen.classList.remove('active');
    sessionScreen.classList.remove('active');
    endScreen.classList.add('active');
    
    endSessionTitle.textContent = data.title || `Session ${id.split('-')[0]}`;
    
    if (data.system_prompt) {
        endMetaTags.innerHTML = `<span class="meta-tag">Role: ${escapeHtml(data.system_prompt.slice(0, 50))}...</span>`;
    } else {
        endMetaTags.innerHTML = '';
    }
    
    summaryContent.innerHTML = data.summary ? 
        renderSanitizedMarkdown(data.summary) : 
        '<p>No summary generated for this session yet.</p>';
        
    fetchSessions();
}

newChatBtn.addEventListener('click', () => {
    endScreen.classList.remove('active');
    sessionScreen.classList.remove('active');
    setupScreen.classList.add('active');
    currentSessionId = null;
    fetchSessions();
});

// --- Renaming Logic ---
function openRenameModal(sessionId, currentTitle) {
    sessionToRename = sessionId;
    renameInput.value = currentTitle;
    renameModal.style.display = 'flex';
    renameInput.focus();
    renameInput.select();
}

function closeRenameModal() {
    renameModal.style.display = 'none';
    sessionToRename = null;
}

cancelRenameBtn.addEventListener('click', closeRenameModal);

confirmRenameBtn.addEventListener('click', async () => {
    const newTitle = renameInput.value.trim();
    if (!newTitle || !sessionToRename) return;
    
    try {
        await fetch(`/api/sessions/${sessionToRename}/rename`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-Id': userId
            },
            body: JSON.stringify({ title: newTitle })
        });
    } catch (e) {}

    const local = getLocalSessions();
    const item = local.find(s => s.id === sessionToRename);
    if (item) {
        item.title = newTitle;
        saveLocalSessions(local);
    }
    
    if (currentSessionId === sessionToRename) {
        currentSessionTitle = newTitle;
        activeSessionTitle.textContent = newTitle;
        endSessionTitle.textContent = newTitle;
    }
    closeRenameModal();
    fetchSessions();
});

renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRenameBtn.click();
    if (e.key === 'Escape') closeRenameModal();
});

renameActiveBtn.addEventListener('click', () => {
    if (currentSessionId) {
        openRenameModal(currentSessionId, currentSessionTitle);
    }
});

// --- Web Audio API & Direct Streaming Setup ---
async function setupAudio() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        }
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        }
    });

    const source = audioContext.createMediaStreamSource(micStream);
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
        if (!isStreamingAudio || !deepgramWs || deepgramWs.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS audio energy
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        const pcm16 = new Int16Array(inputData.length);

        // Gentle noise gate: if mic input is below ambient noise floor (0.003),
        // send digital silence (zeros) so Deepgram's VAD does not trigger on fan hum or mic hiss
        if (rms < 0.003) {
            deepgramWs.send(pcm16.buffer);
            return;
        }
        
        // Convert Float32Array to 16-bit signed PCM
        for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        deepgramWs.send(pcm16.buffer);
    };

    source.connect(scriptProcessor);
    const muteNode = audioContext.createGain();
    muteNode.gain.value = 0;
    scriptProcessor.connect(muteNode);
    muteNode.connect(audioContext.destination);
}

function stopAudio() {
    isStreamingAudio = false;
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    clearDraftBubble();
    cancelAssistantSpeech();
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Play incoming 16kHz PCM audio chunk from Cartesia TTS
function playAudioChunk(arrayBuffer) {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
    
    // Ensure even byte length for Int16Array
    const byteLen = arrayBuffer.byteLength - (arrayBuffer.byteLength % 2);
    if (byteLen <= 0) return;
    const int16Array = new Int16Array(arrayBuffer, 0, byteLen / 2);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }

    const buffer = audioContext.createBuffer(1, float32Array.length, 16000);
    buffer.getChannelData(0).set(float32Array);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const now = audioContext.currentTime;
    if (nextAudioPlayTime < now) {
        nextAudioPlayTime = now;
    }
    source.start(nextAudioPlayTime);
    nextAudioPlayTime += buffer.duration;
    
    activeAudioSources.push(source);
    source.onended = () => {
        const idx = activeAudioSources.indexOf(source);
        if (idx !== -1) activeAudioSources.splice(idx, 1);
        if (activeAudioSources.length === 0 && !isBrowserTtsActive && speechActivityIndicator) {
            speechActivityIndicator.innerHTML = '<span class="status-dot"></span> <span class="indicator-text">Listening...</span>';
        }
    };
}

// --- Web Speech API (Free Built-in TTS Fallback) ---
let browserTtsQueue = [];
let isBrowserTtsActive = false;
let isCartesiaFallbackActive = false;

function cancelBrowserTts() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    browserTtsQueue = [];
    isBrowserTtsActive = false;
}

function processBrowserTtsQueue() {
    if (!('speechSynthesis' in window)) return;
    if (isBrowserTtsActive || browserTtsQueue.length === 0) return;

    const nextText = browserTtsQueue.shift();
    if (!nextText) {
        processBrowserTtsQueue();
        return;
    }

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick user-selected voice, or natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const savedVoice = getSettings().browser_voice;
    let chosenVoice = savedVoice ? voices.find(v => v.name === savedVoice) : null;
    if (!chosenVoice) {
        chosenVoice = voices.find(v => v.lang.startsWith('en') && (
            v.name.includes('Natural') || 
            v.name.includes('Online') || 
            v.name.includes('Google') || 
            v.name.includes('Jenny') || 
            v.name.includes('Guy') || 
            v.name.includes('Samantha') || 
            v.name.includes('Daniel')
        )) || voices.find(v => v.lang.startsWith('en'));
    }
    if (chosenVoice) utterance.voice = chosenVoice;

    utterance.onstart = () => {
        isBrowserTtsActive = true;
        if (speechActivityIndicator) {
            speechActivityIndicator.innerHTML = '<span class="status-dot" style="background:#a78bfa;"></span> <span class="indicator-text" style="color:#c4b5fd;">AI Speaking (Free Voice)...</span>';
        }
    };

    const finishUtterance = () => {
        isBrowserTtsActive = false;
        if (browserTtsQueue.length > 0) {
            processBrowserTtsQueue();
        } else if (activeAudioSources.length === 0 && speechActivityIndicator) {
            speechActivityIndicator.innerHTML = '<span class="status-dot"></span> <span class="indicator-text">Listening...</span>';
        }
    };

    utterance.onend = finishUtterance;
    utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        finishUtterance();
    };

    window.speechSynthesis.speak(utterance);
}

function speakBrowserChunk(text) {
    if (!('speechSynthesis' in window)) return;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    browserTtsQueue.push(clean);
    processBrowserTtsQueue();
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

// Stop current speech playback (barge-in / interruption)
function cancelAssistantSpeech() {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    activeAudioSources.forEach(s => {
        try { s.stop(); } catch (e) {}
    });
    activeAudioSources = [];
    nextAudioPlayTime = 0;
    
    // Stop browser TTS
    cancelBrowserTts();

    if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN && currentContextId && isCartesiaContextActive) {
        try {
            cartesiaWs.send(JSON.stringify({
                context_id: currentContextId,
                cancel: true
            }));
        } catch (e) {
            console.warn('Cartesia cancel error:', e);
        }
    }
    currentContextId = null;
    isCartesiaContextActive = false;
}

// --- Direct Browser Voice Engine ---
let currentUtteranceChunks = [];
let speechFinalTimeout = null;
let draftUserBubble = null;

function updateDraftBubble(chunks, interimText = '') {
    if (!transcriptMessages) return;
    const fullFinal = (chunks || []).join(' ').trim();
    const hasContent = fullFinal.length > 0 || (interimText && interimText.trim().length > 0);

    if (!hasContent) {
        clearDraftBubble();
        return;
    }

    // Clear empty state prompt if visible
    const emptyHint = transcriptMessages.querySelector('.transcript-empty');
    if (emptyHint) emptyHint.remove();

    if (!draftUserBubble) {
        draftUserBubble = document.createElement('div');
        draftUserBubble.className = 'transcript-bubble draft';
        transcriptMessages.appendChild(draftUserBubble);
    }

    const interimHtml = (interimText && interimText.trim().length > 0)
        ? `<span class="interim">${fullFinal ? ' ' : ''}${escapeHtml(interimText.trim())}</span>`
        : '';

    draftUserBubble.innerHTML = `
        <div class="draft-label"><span class="draft-dot"></span> Composing (You)</div>
        <div class="draft-content">${escapeHtml(fullFinal)}${interimHtml}</div>
    `;

    const isNearBottom = transcriptMessages.scrollHeight - transcriptMessages.scrollTop - transcriptMessages.clientHeight < 220;
    if (isNearBottom) {
        transcriptMessages.scrollTo({
            top: transcriptMessages.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function clearDraftBubble() {
    if (draftUserBubble) {
        draftUserBubble.remove();
        draftUserBubble = null;
    }
}

function commitUserUtterance() {
    if (speechFinalTimeout) {
        clearTimeout(speechFinalTimeout);
        speechFinalTimeout = null;
    }

    clearDraftBubble();
    
    // Only commit if finalized chunks were received
    if (!currentUtteranceChunks || currentUtteranceChunks.length === 0) return;

    const fullText = currentUtteranceChunks.join(' ').trim();
    currentUtteranceChunks = [];
    if (!fullText) return;

    // Filter out solitary punctuation or trivial acoustic artifacts (< 2 alphanumeric chars)
    const alphanumeric = fullText.replace(/[^a-zA-Z0-9]/g, '');
    if (alphanumeric.length < 2) return;

    console.log('User speech committed:', fullText);
    cancelAssistantSpeech();
    renderTranscript('user', fullText);
    triggerAssistantTurn(fullText);
}

function connectDeepgram(apiKey, retryCount = 0) {
    const settings = getSettings();
    const pauseTolerance = parseInt(settings.speech_pause_tolerance) || 1500;
    const utteranceEndMs = Math.round(pauseTolerance * 1.35); // e.g. 2000ms
    const fallbackTimeoutMs = Math.round(pauseTolerance * 1.2); // e.g. 1800ms

    const sampleRate = audioContext ? audioContext.sampleRate : 16000;
    // Dynamic endpointing based on user pause tolerance (default 1500ms)
    const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&encoding=linear16&sample_rate=${sampleRate}&channels=1&smart_format=true&interim_results=true&endpointing=${pauseTolerance}&vad_events=true&utterance_end_ms=${utteranceEndMs}`;
    deepgramWs = new WebSocket(wsUrl, ['token', apiKey]);
    deepgramWs.binaryType = 'arraybuffer';

    deepgramWs.onopen = () => {
        console.log('Deepgram live STT connected at', sampleRate, 'Hz, pause tolerance:', pauseTolerance, 'ms');
        if (speechActivityIndicator) {
            speechActivityIndicator.innerHTML = '<span class="status-dot"></span> <span class="indicator-text">Listening...</span>';
        }
    };

    deepgramWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // 1. User began vocalizing (VAD) -> update status dot only; DO NOT interrupt assistant speech!
            if (data.type === 'SpeechStarted') {
                if (speechActivityIndicator) {
                    speechActivityIndicator.innerHTML = '<span class="status-dot" style="background:#22c55e;"></span> <span class="indicator-text">Listening...</span>';
                }
                return;
            }

            // 2. User stopped speaking (VAD UtteranceEnd) -> in auto mode, commit turn if chunks exist
            if (data.type === 'UtteranceEnd') {
                const currentSettings = getSettings();
                if (currentSettings.listening_mode !== 'manual') {
                    commitUserUtterance();
                }
                return;
            }

            // 3. Transcript Results
            if (data.type === 'Results') {
                const alt = data.channel?.alternatives?.[0];
                const transcript = alt?.transcript?.trim();
                const isFinal = data.is_final;
                const speechFinal = data.speech_final;

                if (transcript && transcript.length > 0) {
                    const cleanWords = transcript.replace(/[^a-zA-Z0-9]/g, "").trim();

                    // ONLY interrupt assistant if recognizable words (>= 2 chars) are spoken!
                    if (cleanWords.length >= 2) {
                        cancelAssistantSpeech();
                    }

                    if (speechActivityIndicator) {
                        speechActivityIndicator.innerHTML = `<span class="status-dot" style="background:#22c55e;"></span> <span class="indicator-text">Listening...</span>`;
                    }

                    // Accumulate stable, finalized segments into draft bubble
                    if (isFinal) {
                        currentUtteranceChunks.push(transcript);
                        updateDraftBubble(currentUtteranceChunks, '');
                        
                        const currentSettings = getSettings();
                        if (currentSettings.listening_mode !== 'manual') {
                            // Fallback silence timer after finalized speech chunk in Auto mode
                            if (speechFinalTimeout) clearTimeout(speechFinalTimeout);
                            speechFinalTimeout = setTimeout(() => {
                                commitUserUtterance();
                            }, fallbackTimeoutMs);
                        }
                    } else {
                        // Interim hypothesis -> display preview live in the chat draft bubble!
                        updateDraftBubble(currentUtteranceChunks, transcript);
                    }
                }

                // If Deepgram endpointing detected end of speech, commit in Auto mode
                if (speechFinal) {
                    const currentSettings = getSettings();
                    if (currentSettings.listening_mode !== 'manual') {
                        commitUserUtterance();
                    }
                }
            }
        } catch (e) {
            console.error('Deepgram message parsing error', e);
        }
    };

    deepgramWs.onerror = (err) => {
        console.error('Deepgram WebSocket error:', err);
    };
    deepgramWs.onclose = (e) => {
        console.log('Deepgram WebSocket closed:', e.code, e.reason);
        if (isCallActive && e.code !== 1000 && e.code !== 1005 && retryCount < 3) {
            console.log(`Deepgram disconnected, reconnecting in 1s (attempt ${retryCount + 1})...`);
            setTimeout(() => {
                if (isCallActive) connectDeepgram(apiKey, retryCount + 1);
            }, 1000);
        } else if (isCallActive && e.code !== 1000 && e.code !== 1005) {
            renderTranscript('assistant', `⚠️ Speech Recognition disconnected (${e.code}: ${e.reason || 'Check Deepgram key'}).`);
        }
    };
}

function connectCartesia(apiKey, voiceId, retryCount = 0) {
    const wsUrl = `wss://api.cartesia.ai/tts/websocket?api_key=${encodeURIComponent(apiKey)}&cartesia_version=2024-06-10`;
    cartesiaWs = new WebSocket(wsUrl);

    cartesiaWs.onopen = () => {
        console.log('Cartesia live TTS connected');
    };

    cartesiaWs.onmessage = async (event) => {
        if (typeof event.data === 'string') {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'error') {
                    const errStr = (msg.error || JSON.stringify(msg)).toString();
                    // Benign cancellation / completion notices: do not spam the transcript
                    if (errStr.toLowerCase().includes('context id') || 
                        errStr.toLowerCase().includes('cancelled') ||
                        errStr.toLowerCase().includes('canceled') ||
                        msg.status_code === 400) {
                        console.warn('Cartesia context status (ignored):', errStr);
                        if (msg.context_id && msg.context_id === currentContextId) {
                            currentContextId = null;
                            isCartesiaContextActive = false;
                        }
                        return;
                    }
                    console.error('Cartesia error:', errStr);
                    const isCreditOrLimitError = errStr.toLowerCase().includes('credit') || 
                                                 errStr.toLowerCase().includes('quota') || 
                                                 errStr.toLowerCase().includes('limit') || 
                                                 errStr.toLowerCase().includes('plan') || 
                                                 errStr.toLowerCase().includes('payment') || 
                                                 msg.status_code === 402 || 
                                                 msg.status_code === 401;

                    if (isCreditOrLimitError) {
                        isCartesiaFallbackActive = true;
                        renderTranscript('assistant', `⚠️ Cartesia credits or plan limit reached. Automatically switched to Free Browser Voice.`);
                        return;
                    }

                    renderTranscript('assistant', `⚠️ Voice Synthesis Error: ${msg.error || 'Check Cartesia key'}`);
                    return;
                }
                if (msg.type === 'done') {
                    if (msg.context_id && msg.context_id === currentContextId) {
                        currentContextId = null;
                        isCartesiaContextActive = false;
                    }
                    return;
                }
                if (msg.type === 'chunk' && msg.data) {
                    // Discard audio chunks from previous or cancelled turns
                    if (msg.context_id && msg.context_id !== currentContextId) {
                        return;
                    }
                    const arrayBuffer = base64ToArrayBuffer(msg.data);
                    playAudioChunk(arrayBuffer);
                }
            } catch (e) {
                console.error('Cartesia chunk parse error', e);
            }
        } else {
            // Binary audio chunk
            const arrayBuffer = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
            playAudioChunk(arrayBuffer);
        }
    };

    cartesiaWs.onerror = (err) => {
        console.error('Cartesia WebSocket error:', err);
    };
    cartesiaWs.onclose = (e) => {
        console.log('Cartesia WebSocket closed:', e.code, e.reason);
        currentContextId = null;
        isCartesiaContextActive = false;
        if (isCallActive && e.code !== 1000 && e.code !== 1005 && retryCount < 2) {
            console.log(`Cartesia disconnected, reconnecting in 1s (attempt ${retryCount + 1})...`);
            setTimeout(() => {
                if (isCallActive) connectCartesia(apiKey, voiceId, retryCount + 1);
            }, 1000);
        } else if (isCallActive && e.code !== 1000 && e.code !== 1005) {
            isCartesiaFallbackActive = true;
            renderTranscript('assistant', `⚠️ Cartesia disconnected (${e.code}). Seamlessly switched to Free Browser Voice.`);
        }
    };
}

// ---------------------------------------------------------------------------
// TTS Text Filter — strips markdown syntax & suppresses code/mermaid blocks
// ---------------------------------------------------------------------------
//
// Because the LLM streams in chunks, we can't parse the full response at once.
// This class maintains state across chunks so we correctly detect when we enter
// and exit a fenced code block mid-stream.
//
// Usage:
//   const filter = new TtsFilter();
//   const spoken = filter.process(rawChunk);   // returns only what should be spoken
//
class TtsFilter {
    constructor() {
        this._inCodeBlock = false;   // inside ``` ... ``` fence
        this._isMermaid   = false;   // the fence is ```mermaid specifically
        this._announcedBlock = false; // already injected the spoken substitute for this block
        this._lineAccum   = '';       // accumulate chars until we see \n (so we can detect ``` fence lines)
    }

    process(chunk) {
        let output = '';
        for (const ch of chunk) {
            this._lineAccum += ch;

            if (ch === '\n') {
                const line = this._lineAccum;
                this._lineAccum = '';
                output += this._processLine(line);
            }
        }
        // Don't process partial lines yet — they'll be processed on the next \n
        // (partial lines are already in _lineAccum, output is already built)
        return output;
    }

    // Flush any remaining partial line at end of turn
    flush() {
        const line = this._lineAccum;
        this._lineAccum = '';
        return line ? this._processLine(line + '\n') : '';
    }

    _processLine(line) {
        const trimmed = line.trim();

        // Detect opening/closing code fence (``` or ~~~)
        if (/^(`{3,}|~{3,})/.test(trimmed)) {
            if (!this._inCodeBlock) {
                // Opening fence
                this._inCodeBlock = true;
                this._isMermaid = /^(`{3,}|~{3,})\s*mermaid/i.test(trimmed);
                this._announcedBlock = false;
                return ''; // suppress the fence line itself
            } else {
                // Closing fence
                this._inCodeBlock = false;
                this._isMermaid = false;
                this._announcedBlock = false;
                return ''; // suppress the closing fence line
            }
        }

        if (this._inCodeBlock) {
            // First line of content inside the block — speak a substitute once
            if (!this._announcedBlock && trimmed.length > 0) {
                this._announcedBlock = true;
                return this._isMermaid
                    ? "I've drawn a diagram on screen for you. "
                    : "See the code block on screen. ";
            }
            // All remaining lines inside the block — suppressed
            return '';
        }

        // Outside code blocks — strip markdown syntax characters
        return this._stripMarkdown(line);
    }

    _stripMarkdown(text) {
        return text
            // Remove heading markers (# ## ### at start of line)
            .replace(/^#{1,6}\s+/gm, '')
            // Remove horizontal rules
            .replace(/^[-*_]{3,}\s*$/gm, '')
            // Remove bold/italic markers (**text** *text* __text__ _text_)
            .replace(/(\*{1,3}|_{1,3})(.*?)\1/gs, '$2')
            // Remove inline code backticks `code`
            .replace(/`([^`]+)`/g, '$1')
            // Remove blockquote markers
            .replace(/^>\s*/gm, '')
            // Remove list markers (- * + and numbered 1.)
            .replace(/^[\s]*[-*+]\s+/gm, '')
            .replace(/^[\s]*\d+\.\s+/gm, '')
            // Collapse excessive whitespace/newlines into a single space
            .replace(/\n+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
}

// Trigger conversational response from LLM and stream to Cartesia TTS
async function triggerAssistantTurn(userText) {
    const settings = getSettings();
    const selectedProvider = providerSelect.value;
    
    let activeEndpoint = settings.llm_endpoint;
    let activeModel = settings.llm_model;
    let activeLlmKey = settings.llm_key;

    if (selectedProvider !== 'custom' && LLM_PRESETS[selectedProvider]) {
        if (selectedProvider === settings.llm_preset) {
            activeEndpoint = settings.llm_endpoint || LLM_PRESETS[selectedProvider].endpoint;
            activeModel = settings.llm_model || LLM_PRESETS[selectedProvider].model;
            activeLlmKey = settings.llm_key;
        } else {
            activeEndpoint = LLM_PRESETS[selectedProvider].endpoint;
            activeModel = LLM_PRESETS[selectedProvider].model;
        }
    }

    if (speechActivityIndicator) {
        speechActivityIndicator.innerHTML = '<span class="status-dot" style="background:#a78bfa;"></span> <span class="indicator-text" style="color:#c4b5fd;">AI Thinking...</span>';
    }

    // Add to session message history
    if (userText) {
        sessionMessages.push({ role: 'user', content: userText });
    }

    // Synchronize timer to the exact current millisecond
    updateTimerDisplay();

    const elapsedSeconds = Math.max(0, totalDurationSeconds - remainingSeconds);
    const elapsedM = Math.floor(elapsedSeconds / 60);
    const elapsedS = elapsedSeconds % 60;
    const remM = Math.floor(remainingSeconds / 60);
    const remS = remainingSeconds % 60;
    const currentTimerDisplayStr = `${remM}:${remS.toString().padStart(2, '0')}`;
    const perc = Math.round((elapsedSeconds / totalDurationSeconds) * 100);

    let phase = 'Early Phase (Introductions & Exploration)';
    if (perc > 85) phase = 'Final Phase (Wrapping Up & Action Items)';
    else if (perc > 60) phase = 'Late Phase (Key Takeaways & Review)';
    else if (perc > 30) phase = 'Mid Phase (Deep Dive & Discussion)';

    const timeContext = (
        `\n\n[Live Session Timer & Screen Display]:\n` +
        `- Current On-Screen Timer Reading: "${currentTimerDisplayStr}" (${remM} minutes, ${remS} seconds remaining)\n` +
        `- Elapsed Call Time: ${elapsedM}:${elapsedS.toString().padStart(2, '0')} (Total duration: ${Math.floor(totalDurationSeconds / 60)}:00, ${perc}% complete)\n` +
        `- Current Phase: ${phase}\n` +
        `- Timer State: ${isTimerPaused ? 'Paused' : 'Active and ticking down'}\n` +
        `- CRITICAL: The user sees "${currentTimerDisplayStr}" on their screen right now. If the user asks about the timer or remaining time, state this exact reading directly (e.g. "${remM} minutes and ${remS} seconds", or "${currentTimerDisplayStr}"). NEVER claim you cannot see the screen or give an outdated time.`
    );

    const systemPrompt = systemPromptInput.value.trim();
    const baseInstructions = (
        "You are participating in a real-time conversational voice call connected to an interactive Visual Studio interface.\n" +
        "- You have a LIVE visual workspace that renders Markdown, syntax-highlighted code blocks, and Mermaid diagrams in real-time.\n" +
        "- Whenever explaining architectures, workflows, data pipelines, state machines, or comparisons, ALWAYS generate a Mermaid diagram inside ```mermaid ... ``` code blocks. The visual canvas will render it into an interactive SVG diagram on the user's screen!\n" +
        "- When providing code, use markdown ```<language> ... ``` code blocks.\n" +
        "- Use markdown formatting (bold, bullet points, numbered lists) for clarity.\n" +
        "- For voice synthesis, keep your spoken words conversational, direct, and concise (1-3 sentences), letting the visual workspace and diagram display the technical detail."
    );

    const finalSystemPrompt = (systemPrompt ? `${systemPrompt}\n\n[Voice Guidelines]:\n${baseInstructions}` : `You are a versatile, highly intelligent AI voice assistant.\n\n[Voice Guidelines]:\n${baseInstructions}`) + timeContext;

    currentAbortController = new AbortController();
    const turnContextId = 'ctx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    currentContextId = turnContextId;
    isCartesiaContextActive = false;
    const activeVoiceId = settings.cartesia_voice || '79a125e8-cd45-4c13-8a67-188112f4dd22';

    let assistantBubble = document.createElement('div');
    assistantBubble.className = 'transcript-bubble assistant';
    assistantBubble.dataset.fullText = '';
    assistantBubble.innerHTML = `
        <div class="bubble-header">AI Assistant</div>
        <div class="bubble-content"><span style="color:var(--text-dim);font-style:italic;">Listening & Thinking...</span></div>
    `;
    transcriptMessages.appendChild(assistantBubble);
    transcriptMessages.scrollTo({ top: transcriptMessages.scrollHeight, behavior: 'smooth' });
    const contentDiv = assistantBubble.querySelector('.bubble-content');

    let assistantFullText = '';
    let sentenceBuffer = '';
    let lastRenderTime = 0;

    try {
        const res = await fetch(`${activeEndpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${activeLlmKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: activeModel,
                messages: [
                    { role: 'system', content: finalSystemPrompt },
                    ...sessionMessages
                ],
                stream: true
            }),
            signal: currentAbortController.signal
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`LLM error (${res.status}): ${err}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let lineBuffer = '';
        const ttsFilter = new TtsFilter(); // stateful markdown/code stripper for TTS

        if (speechActivityIndicator) {
            speechActivityIndicator.innerHTML = '<span class="status-dot" style="background:#a78bfa;"></span> <span class="indicator-text" style="color:#c4b5fd;">AI Speaking</span>';
        }

        while (!done) {
            if (currentAbortController?.signal?.aborted || currentContextId !== turnContextId) {
                break;
            }
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (value) {
                lineBuffer += decoder.decode(value, { stream: !done });
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop(); // Keep unfinished line

                for (const line of lines) {
                    if (currentAbortController?.signal?.aborted || currentContextId !== turnContextId) {
                        break;
                    }
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.substring(6));
                            const delta = json.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                assistantFullText += delta;

                                // Pass raw delta through the TTS filter
                                // (filter accumulates until \n, so it may return '' for partial lines)
                                const ttsChunk = ttsFilter.process(delta);
                                if (ttsChunk) sentenceBuffer += ttsChunk;

                                // Live UI update (throttled to 60ms for silky smooth rendering)
                                const now = Date.now();
                                if (now - lastRenderTime > 60 && contentDiv) {
                                    lastRenderTime = now;
                                    assistantBubble.dataset.fullText = assistantFullText;
                                    contentDiv.innerHTML = formatMarkdownText(assistantFullText);
                                    transcriptMessages.scrollTo({ top: transcriptMessages.scrollHeight, behavior: 'smooth' });
                                }

                                // Flush sentence buffer to Cartesia at natural clause boundaries
                                const hasPunctuation = /[.!?]/.test(ttsChunk);
                                if ((hasPunctuation && sentenceBuffer.length > 15) || sentenceBuffer.length > 80) {
                                    if (currentContextId === turnContextId && !currentAbortController?.signal?.aborted) {
                                        sendTtsChunk(sentenceBuffer.trim(), activeVoiceId, true);
                                    }
                                    sentenceBuffer = '';
                                }
                            }
                        } catch (err) {}
                    }
                }
            }
        }

        // Flush filter's partial line accumulator, then send any remaining TTS buffer
        if (currentContextId === turnContextId && !currentAbortController?.signal?.aborted) {
            const finalChunk = (ttsFilter.flush() + sentenceBuffer).trim();
            if (finalChunk) {
                sendTtsChunk(finalChunk, activeVoiceId, false);
            } else if (isCartesiaContextActive) {
                sendTtsFinalize(activeVoiceId);
            }
        }

        // Finalize assistant bubble with rich markdown & Mermaid SVGs
        if (contentDiv) {
            assistantBubble.dataset.fullText = assistantFullText;
            contentDiv.innerHTML = formatMarkdownText(assistantFullText);
            await renderMermaidDiagramsInElement(contentDiv);
            contentDiv.querySelectorAll('pre code').forEach(block => {
                if (window.hljs && !block.classList.contains('language-mermaid')) {
                    hljs.highlightElement(block);
                }
            });
            transcriptMessages.scrollTo({ top: transcriptMessages.scrollHeight, behavior: 'smooth' });
        }

        if (assistantFullText.trim()) {
            sessionMessages.push({ role: 'assistant', content: assistantFullText });
            checkForVisualArtifacts(assistantFullText);
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Assistant turn interrupted by user');
            if (!assistantFullText.trim() && assistantBubble && assistantBubble.parentNode) {
                assistantBubble.remove();
            }
        } else {
            console.error('Assistant turn error:', e);
            renderTranscript('assistant', `⚠️ (LLM Connection Error: ${e.message})`);
        }
        if (currentContextId === turnContextId) {
            cancelAssistantSpeech();
        }
    }
}

function sendTtsChunk(text, voiceId, continueFlag) {
    const s = getSettings();
    const useBrowser = (s.tts_provider === 'browser') || isCartesiaFallbackActive;

    if (useBrowser) {
        speakBrowserChunk(text);
        return;
    }

    if (!cartesiaWs || cartesiaWs.readyState !== WebSocket.OPEN) {
        speakBrowserChunk(text);
        return;
    }
    if (!currentContextId) return;
    try {
        cartesiaWs.send(JSON.stringify({
            context_id: currentContextId,
            model_id: "sonic-3.6",
            transcript: text,
            voice: { mode: "id", id: voiceId },
            output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
            continue: continueFlag
        }));
        isCartesiaContextActive = true;
    } catch (e) {
        console.error('Cartesia send error', e);
        speakBrowserChunk(text);
    }
}

function sendTtsFinalize(voiceId) {
    const s = getSettings();
    const useBrowser = (s.tts_provider === 'browser') || isCartesiaFallbackActive;
    if (useBrowser) return;

    if (!cartesiaWs || cartesiaWs.readyState !== WebSocket.OPEN) return;
    if (!currentContextId || !isCartesiaContextActive) return;
    try {
        cartesiaWs.send(JSON.stringify({
            context_id: currentContextId,
            model_id: "sonic-3.6",
            transcript: " ",
            voice: { mode: "id", id: voiceId },
            output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
            continue: false
        }));
    } catch (e) {}
}

// Check for Mermaid diagrams and code blocks to display in Visual Workspace
function checkForVisualArtifacts(text) {
    if (!text) return;
    let foundVisuals = false;

    // 1. Mermaid Diagrams
    const mermaidRegex = /```mermaid\s*([\s\S]*?)```/gi;
    let mermaidMatch;
    while ((mermaidMatch = mermaidRegex.exec(text)) !== null) {
        const diagramCode = mermaidMatch[1].trim();
        renderVisual({
            frame_class: 'MermaidDiagramFrame',
            diagram_type: 'diagram',
            diagram_code: diagramCode
        });
        foundVisuals = true;
    }

    // 2. Code Snippets
    const codeRegex = /```(\w+)\s*([\s\S]*?)```/gi;
    let codeMatch;
    while ((codeMatch = codeRegex.exec(text)) !== null) {
        const lang = codeMatch[1].toLowerCase();
        if (lang === 'mermaid') continue;
        const code = codeMatch[2].trim();
        renderVisual({
            frame_class: 'CodeSnippetFrame',
            language: lang,
            code: code
        });
        foundVisuals = true;
    }

    // Auto-open visual workspace if visuals are produced
    if (foundVisuals && visualCanvas) {
        visualCanvas.style.display = 'flex';
        visualsToggleBtn.style.display = 'inline-flex';
    }
}

// --- Enter Room (Direct Browser Voice Session) ---
joinBtn.addEventListener('click', async () => {
    // If settings inputs have values, make sure they are saved
    const formSettings = readSettingsFromForm();
    saveSettings({ ...getSettings(), ...formSettings });

    const settings = getSettings();
    const selectedProvider = providerSelect.value;
    const systemPrompt = systemPromptInput.value.trim();
    const title = sessionTitleInput.value.trim();

    // Check required BYOK keys
    if (!settings.deepgram_key) {
        alert("Deepgram API Key is missing. Please enter it in Settings under the Deepgram tab.");
        openSettingsModal();
        return;
    }

    const isCartesiaEngine = (settings.tts_provider || 'cartesia') === 'cartesia';
    if (isCartesiaEngine && !settings.cartesia_key) {
        alert("Cartesia API Key is missing. Please enter it in Settings, or switch TTS Voice Engine to 'Browser Built-in Voice' for 100% free speech.");
        openSettingsModal();
        return;
    }

    let activeLlmKey = settings.llm_key;
    if (!activeLlmKey) {
        alert("LLM API Key is missing. Please enter your API key in Settings under the LLM tab.");
        openSettingsModal();
        return;
    }

    joinBtn.disabled = true;
    joinBtn.innerHTML = '<span>Connecting...</span>';

    try {
        await setupAudio();

        // Register session in Cloudflare D1
        currentSessionId = 'ses_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        currentSessionTitle = title || `Session ${currentSessionId.slice(4, 12)}`;

        fetch('/api/sessions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-Id': userId
            },
            body: JSON.stringify({
                id: currentSessionId,
                user_id: userId,
                title: currentSessionTitle,
                provider: selectedProvider,
                model: settings.llm_model || settings.llm_preset,
                system_prompt: systemPrompt
            })
        }).catch(e => console.warn('D1 session registration note:', e));

        // Mirror session locally
        const newRecord = {
            id: currentSessionId,
            user_id: userId,
            title: currentSessionTitle,
            provider: selectedProvider,
            model: settings.llm_model || settings.llm_preset,
            system_prompt: systemPrompt,
            created_at: Math.floor(Date.now() / 1000),
            summary: null,
            transcript: []
        };
        const local = getLocalSessions();
        local.unshift(newRecord);
        saveLocalSessions(local);

        // Connect STT & TTS
        connectDeepgram(settings.deepgram_key);
        isCartesiaFallbackActive = !isCartesiaEngine;
        if (isCartesiaEngine && settings.cartesia_key) {
            connectCartesia(settings.cartesia_key, settings.cartesia_voice);
        }

        // Switch UI to active call
        isCallActive = true;
        isStreamingAudio = true; // Stream immediately!
        sessionMessages = [];
        currentVisuals = [];
        currentUtteranceChunks = [];
        
        setupScreen.classList.remove('active');
        sessionScreen.classList.add('active');

        activeSessionTitle.textContent = currentSessionTitle;
        activeProviderTag.textContent = (settings.llm_model || selectedProvider).toUpperCase();

        startCallBtn.style.display = 'none';
        if (listeningModeToggle) listeningModeToggle.style.display = 'inline-flex';
        if (commitNowBtn) commitNowBtn.style.display = 'inline-flex';
        updateListeningModeUI();
        clearDraftBubble();
        pauseBtn.style.display = 'inline-flex';
        extendBtn.style.display = 'inline-flex';
        visualsToggleBtn.style.display = 'none';
        endBtn.style.display = 'inline-flex';
        visualCanvas.style.display = 'none';

        transcriptMessages.innerHTML = `
            <div class="transcript-empty">
                <div class="empty-icon">🎙️</div>
                <h3>Call Connected</h3>
                <p>Connecting voice channels... Speak or listen for the AI's greeting.</p>
            </div>
        `;

        startSessionTimer();
        fetchSessions();

        joinBtn.disabled = false;
        joinBtn.innerHTML = '<span>Enter Room</span>';

        // Trigger opening AI voice greeting after a brief connection pause
        setTimeout(() => {
            if (isCallActive) {
                const emptyHint = transcriptMessages.querySelector('.transcript-empty');
                if (emptyHint) emptyHint.remove();
                triggerAssistantTurn("Hello! Greet me in your defined persona in 1-2 friendly sentences to begin our conversation.");
            }
        }, 800);

    } catch (e) {
        console.error("Session start error:", e);
        alert(`Could not start session: ${e.message || e}`);
        joinBtn.disabled = false;
        joinBtn.innerHTML = '<span>Enter Room</span>';
        stopAudio();
    }
});

// Start call button fallback (if ever displayed)
startCallBtn.addEventListener('click', () => {
    isStreamingAudio = true;
    startSessionTimer();

    startCallBtn.style.display = 'none';
    if (listeningModeToggle) listeningModeToggle.style.display = 'inline-flex';
    if (commitNowBtn) commitNowBtn.style.display = 'inline-flex';
    updateListeningModeUI();
    clearDraftBubble();
    pauseBtn.style.display = 'inline-flex';
    extendBtn.style.display = 'inline-flex';
    endBtn.style.display = 'inline-flex';

    if (speechActivityIndicator) {
        speechActivityIndicator.innerHTML = '<span class="status-dot"></span> <span class="indicator-text">Listening...</span>';
    }

    const emptyHint = transcriptMessages.querySelector('.transcript-empty');
    if (emptyHint) emptyHint.remove();

    triggerAssistantTurn("Hello! Greet me in your defined persona in 1-2 friendly sentences to begin our conversation.");
});

// --- Live Transcript Rendering & Smooth Scrolling ---
let lastAssistantBubble = null;

function renderTranscript(role, text) {
    if (!transcriptMessages) return;

    const emptyHint = transcriptMessages.querySelector('.transcript-empty');
    if (emptyHint) emptyHint.remove();

    if (role === 'user') {
        lastAssistantBubble = null;
        const bubble = document.createElement('div');
        bubble.className = 'transcript-bubble user';
        bubble.innerHTML = `
            <div class="bubble-header">You</div>
            <div class="bubble-content">${escapeHtml(text)}</div>
        `;
        transcriptMessages.appendChild(bubble);
        if (speechActivityIndicator) {
            speechActivityIndicator.innerHTML = '<span class="status-dot"></span> <span class="indicator-text">Transcribed</span>';
        }
    } else {
        if (lastAssistantBubble) {
            lastAssistantBubble.dataset.fullText = (lastAssistantBubble.dataset.fullText || '') + text;
            const contentDiv = lastAssistantBubble.querySelector('.bubble-content');
            if (contentDiv) {
                contentDiv.innerHTML = formatMarkdownText(lastAssistantBubble.dataset.fullText);
            }
        } else {
            const bubble = document.createElement('div');
            bubble.className = 'transcript-bubble assistant';
            bubble.dataset.fullText = text;
            bubble.innerHTML = `
                <div class="bubble-header">AI Assistant</div>
                <div class="bubble-content">${formatMarkdownText(text)}</div>
            `;
            transcriptMessages.appendChild(bubble);
            lastAssistantBubble = bubble;
        }
    }

    // Auto-scroll
    const isNearBottom = transcriptMessages.scrollHeight - transcriptMessages.scrollTop - transcriptMessages.clientHeight < 180;
    if (isNearBottom || role === 'user') {
        transcriptMessages.scrollTo({
            top: transcriptMessages.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function formatMarkdownText(text) {
    if (!text) return '';
    return renderSanitizedMarkdown(text);
}

// Render all <code class="language-mermaid"> blocks inside a given container into interactive SVGs
async function renderMermaidDiagramsInElement(container) {
    if (!window.mermaid || !container) return;

    const blocks = container.querySelectorAll('code.language-mermaid, pre.mermaid');
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const rawCode = block.textContent.trim();
        if (!rawCode) continue;

        const pre = block.closest('pre') || block;
        const diagId = 'mermaid_diag_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

        const card = document.createElement('div');
        card.className = 'mermaid-diagram-card';
        card.innerHTML = `
            <div class="mermaid-diagram-header">
                <span>📊 Architecture & Workflow</span>
                <span class="mermaid-badge">Mermaid</span>
            </div>
            <div class="mermaid-diagram-svg" id="${diagId}">
                <div class="mermaid-loading">Rendering diagram...</div>
            </div>
        `;

        if (pre.parentNode) {
            pre.parentNode.replaceChild(card, pre);
        }

        try {
            const { svg } = await mermaid.render(diagId + '_svg', rawCode);
            const target = document.getElementById(diagId);
            if (target) {
                target.innerHTML = svg;
                // Remove hardcoded height so CSS can scale the SVG properly
                const svgEl = target.querySelector('svg');
                if (svgEl) {
                    svgEl.removeAttribute('height');
                    if (!svgEl.getAttribute('viewBox') && svgEl.getAttribute('width') && svgEl.getAttribute('height')) {
                        svgEl.setAttribute('viewBox', `0 0 ${svgEl.getAttribute('width')} ${svgEl.getAttribute('height')}`);
                    }
                    svgEl.style.width = '100%';
                    svgEl.style.height = 'auto';
                }
            }
        } catch (err) {
            console.error('Mermaid render error:', err);
            const target = document.getElementById(diagId);
            if (target) {
                target.innerHTML = `<div style="color:#f87171;font-size:0.8rem;padding:8px;">⚠️ Diagram syntax error: ${escapeHtml(err.message || '')}</div><pre><code>${escapeHtml(rawCode)}</code></pre>`;
            }
        }
    }
}

// Strip markdown code blocks & mermaid syntax so voice synthesis sounds natural
function stripCodeBlocksForTts(text) {
    if (!text) return '';
    return text
        .replace(/```mermaid[\s\S]*?```/gi, ' [Architecture diagram displayed on screen] ')
        .replace(/```[\s\S]*?```/g, ' [Code displayed on screen] ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_#~>]/g, '')
        .trim();
}

// --- Visual Rendering (Embedded in Chat + Side Canvas) ---
async function renderVisual(msg) {
    currentVisuals.push(msg);
    visualsToggleBtn.style.display = 'inline-flex';
    visualsToggleBtn.textContent = `Visuals (${currentVisuals.length})`;

    const sidePlaceholder = canvasBody.querySelector('.canvas-placeholder');
    if (sidePlaceholder) sidePlaceholder.remove();

    if (msg.frame_class === 'CodeSnippetFrame') {
        const sideCard = document.createElement('div');
        sideCard.className = 'embedded-visual-card';
        sideCard.innerHTML = `
            <div class="visual-card-title">${escapeHtml(msg.language || 'code')} snippet</div>
            <div class="visual-card-body">
                <pre><code class="language-${msg.language}">${escapeHtml(msg.code || '')}</code></pre>
            </div>
        `;
        const codeElem = sideCard.querySelector('code');
        if (codeElem && window.hljs) hljs.highlightElement(codeElem);
        canvasBody.appendChild(sideCard);
    } else if (msg.frame_class === 'MermaidDiagramFrame') {
        const diagId = 'side_diag_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const sideCard = document.createElement('div');
        sideCard.className = 'mermaid-diagram-card';
        sideCard.innerHTML = `
            <div class="mermaid-diagram-header">
                <span>📊 Architecture Diagram</span>
                <span class="mermaid-badge">Mermaid</span>
            </div>
            <div class="mermaid-diagram-svg" id="${diagId}">
                <div class="mermaid-loading">Rendering diagram...</div>
            </div>
        `;
        canvasBody.appendChild(sideCard);

        try {
            const { svg } = await mermaid.render(diagId + '_svg', msg.diagram_code);
            const container = document.getElementById(diagId);
            if (container) {
                container.innerHTML = svg;
                // Remove hardcoded height so CSS can scale properly
                const svgEl = container.querySelector('svg');
                if (svgEl) {
                    svgEl.removeAttribute('height');
                    svgEl.style.width = '100%';
                    svgEl.style.height = 'auto';
                }
            }
        } catch (e) {
            const container = document.getElementById(diagId);
            if (container) {
                container.innerHTML = `<div style="color:#f87171;font-size:0.8rem;padding:8px;">⚠️ Diagram syntax error</div><pre><code>${escapeHtml(msg.diagram_code)}</code></pre>`;
            }
        }
    }
}

visualsToggleBtn.addEventListener('click', () => {
    const isVisible = visualCanvas.style.display !== 'none';
    visualCanvas.style.display = isVisible ? 'none' : 'flex';
});

closeCanvasBtn.addEventListener('click', () => {
    visualCanvas.style.display = 'none';
});

// --- Session Timer Logic ---
function updateTimerDisplay() {
    if (!sessionStartTime) return;
    const now = isTimerPaused && sessionPauseStartTime ? sessionPauseStartTime : Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - sessionStartTime - sessionPausedTotalMs) / 1000));
    remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);
    const percentage = totalDurationSeconds > 0 ? elapsedSeconds / totalDurationSeconds : 0;

    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    if (timerDisplay) {
        timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    let phase = 'Early';
    if (percentage > 0.8) phase = 'Final';
    else if (percentage > 0.5) phase = 'Mid';
    if (timerPhase) {
        timerPhase.textContent = isTimerPaused ? 'Phase: Paused' : `Phase: ${phase}`;
    }

    const percDisplay = Math.min(100, percentage * 100);
    if (sessionProgress) {
        sessionProgress.style.width = `${percDisplay}%`;
    }

    let color = 'var(--timer-green)';
    if (percDisplay > 80 || remainingSeconds < 120) {
        color = 'var(--timer-red)';
    } else if (percDisplay > 50) {
        color = 'var(--timer-yellow)';
    }
    if (timerDisplay) timerDisplay.style.color = color;
    if (sessionProgress) sessionProgress.style.backgroundColor = color;

    if (remainingSeconds === 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        handleSessionEnd();
    }
}

function startSessionTimer() {
    sessionStartTime = Date.now();
    sessionPausedTotalMs = 0;
    sessionPauseStartTime = null;
    isTimerPaused = false;
    remainingSeconds = totalDurationSeconds;
    if (timerInterval) clearInterval(timerInterval);

    updateTimerDisplay();

    timerInterval = setInterval(() => {
        if (isTimerPaused) return;
        updateTimerDisplay();
    }, 250); // 4Hz high-precision sync with wall clock
}

pauseBtn.addEventListener('click', () => {
    isTimerPaused = !isTimerPaused;
    isStreamingAudio = !isTimerPaused;
    pauseBtn.textContent = isTimerPaused ? 'Resume' : 'Pause';
    if (isTimerPaused) {
        sessionPauseStartTime = Date.now();
    } else {
        if (sessionPauseStartTime) {
            sessionPausedTotalMs += Date.now() - sessionPauseStartTime;
            sessionPauseStartTime = null;
        }
    }
    updateTimerDisplay();
    if (speechActivityIndicator) {
        speechActivityIndicator.innerHTML = isTimerPaused ?
            '<span class="status-dot" style="background:#f59e0b;"></span> <span class="indicator-text">Paused (Mic Muted)</span>' :
            '<span class="status-dot"></span> <span class="indicator-text">Listening...</span>';
    }
});

extendBtn.addEventListener('click', () => {
    totalDurationSeconds += 300;
    updateTimerDisplay();
});

function updateListeningModeUI() {
    const mode = getSettings().listening_mode || 'auto';
    const isManual = mode === 'manual';

    if (listeningModeToggle) {
        listeningModeToggle.textContent = isManual ? '✋ Manual' : '🎤 Auto';
        listeningModeToggle.title = isManual 
            ? 'Manual Mode: Speak freely, then click "Done Speaking" to send. (Click to switch to Auto)' 
            : 'Auto Mode: AI responds after a silence pause. (Click to switch to Manual)';
        if (isManual) {
            listeningModeToggle.classList.add('manual-active');
        } else {
            listeningModeToggle.classList.remove('manual-active');
        }
    }

    if (commitNowBtn) {
        if (isManual) {
            commitNowBtn.textContent = '✅ Done Speaking';
            commitNowBtn.classList.add('manual-mode');
            commitNowBtn.title = 'Send your full accumulated spoken message to the AI';
        } else {
            commitNowBtn.textContent = '⚡ Done Speaking';
            commitNowBtn.classList.remove('manual-mode');
            commitNowBtn.title = 'Send spoken thought immediately without waiting for silence pause';
        }
    }

    if (settingsListeningMode) {
        settingsListeningMode.value = mode;
    }
}

if (listeningModeToggle) {
    listeningModeToggle.addEventListener('click', () => {
        const s = getSettings();
        s.listening_mode = (s.listening_mode === 'manual') ? 'auto' : 'manual';
        saveSettings(s);
        updateListeningModeUI();
    });
}

if (commitNowBtn) {
    commitNowBtn.addEventListener('click', () => {
        commitUserUtterance();
    });
}

endBtn.addEventListener('click', () => {
    handleSessionEnd();
});

// --- Handle Call End & Post-Session Summary Generation ---
async function handleSessionEnd() {
    if (commitNowBtn) commitNowBtn.style.display = 'none';
    if (listeningModeToggle) listeningModeToggle.style.display = 'none';
    clearDraftBubble();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    sessionStartTime = null;
    stopAudio();
    isCallActive = false;

    if (deepgramWs) {
        deepgramWs.close();
        deepgramWs = null;
    }
    if (cartesiaWs) {
        cartesiaWs.close();
        cartesiaWs = null;
    }

    sessionScreen.classList.remove('active');
    endScreen.classList.add('active');

    endSessionTitle.textContent = currentSessionTitle;
    endMetaTags.innerHTML = `<span class="meta-tag status-live" style="background:rgba(239,68,68,0.15);color:#fca5a5;">Completed</span>`;

    summaryContent.innerHTML = `
        <div class="summary-loading">
            <div class="loading-spinner"></div>
            <p>Generating detailed conversation summary and analysis...</p>
        </div>
    `;

    joinBtn.disabled = false;
    joinBtn.innerHTML = '<span>Enter Room</span>';

    // Generate LLM post-session summary
    try {
        const settings = getSettings();
        const selectedProvider = providerSelect.value;
        let activeEndpoint = settings.llm_endpoint;
        let activeModel = settings.llm_model;
        let activeLlmKey = settings.llm_key;

        if (selectedProvider !== 'custom' && LLM_PRESETS[selectedProvider]) {
            if (selectedProvider === settings.llm_preset) {
                activeEndpoint = settings.llm_endpoint || LLM_PRESETS[selectedProvider].endpoint;
                activeModel = settings.llm_model || LLM_PRESETS[selectedProvider].model;
                activeLlmKey = settings.llm_key;
            } else {
                activeEndpoint = LLM_PRESETS[selectedProvider].endpoint;
                activeModel = LLM_PRESETS[selectedProvider].model;
            }
        }

        const formattedTranscript = sessionMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
        
        if (formattedTranscript.trim().length > 0 && activeLlmKey) {
            const summaryRes = await fetch(`${activeEndpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${activeLlmKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: activeModel,
                    messages: [
                        { role: 'system', content: 'You are an expert AI executive assistant. Produce a clean, formatted Markdown summary of the voice session.' },
                        { role: 'user', content: `Please produce a structured summary based on this call transcript:\n\n${formattedTranscript}\n\nInclude:\n### 1. Key Topics Covered\n### 2. Main Takeaways & Highlights\n### 3. Action Items & Recommendations\n### 4. Brief Overall Assessment` }
                    ]
                })
            });

            if (summaryRes.ok) {
                const sData = await summaryRes.json();
                const summaryText = sData.choices?.[0]?.message?.content || 'Summary generated.';
                summaryContent.innerHTML = renderSanitizedMarkdown(summaryText);

                // Save to Cloudflare D1
                if (currentSessionId) {
                    await fetch(`/api/sessions/${currentSessionId}/summary`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-User-Id': userId
                        },
                        body: JSON.stringify({
                            summary: summaryText,
                            transcript: sessionMessages
                        })
                    }).catch(e => console.warn('Could not save summary to D1:', e));

                    const local = getLocalSessions();
                    const existing = local.find(s => s.id === currentSessionId);
                    if (existing) {
                        existing.summary = summaryText;
                        existing.transcript = sessionMessages;
                        saveLocalSessions(local);
                    }
                }
            } else {
                summaryContent.innerHTML = '<p>Session completed. Could not generate summary from LLM endpoint.</p>';
            }
        } else {
            summaryContent.innerHTML = '<p>Session completed with no spoken conversation recorded.</p>';
        }
    } catch (e) {
        console.error('Summary error:', e);
        summaryContent.innerHTML = `<p>Session completed. (Summary error: ${e.message})</p>`;
    }

    fetchSessions();
}

restartBtn.addEventListener('click', () => {
    endScreen.classList.remove('active');
    setupScreen.classList.add('active');
    currentSessionId = null;
    fetchSessions();
});

exportBtn.addEventListener('click', () => {
    if (sessionMessages.length === 0) {
        alert("No transcript messages to export.");
        return;
    }
    const transcriptText = sessionMessages.map(m => `### ${m.role.toUpperCase()}\n${m.content}\n`).join('\n');
    const blob = new Blob([`# Transcript: ${currentSessionTitle}\n\n${transcriptText}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSessionTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.md`;
    a.click();
    URL.revokeObjectURL(url);
});

if (deleteSessionBtn) {
    deleteSessionBtn.addEventListener('click', () => {
        if (!currentSessionId) return;
        deleteSession(currentSessionId, endSessionTitle.textContent);
    });
}

function renderSanitizedMarkdown(md) {
    if (!md) return '';
    try {
        const rawHtml = marked.parse(md);
        if (window.DOMPurify) {
            return DOMPurify.sanitize(rawHtml);
        }
        return rawHtml;
    } catch (e) {
        return escapeHtml(md);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Init ---
window.addEventListener('DOMContentLoaded', () => {
    const settings = getSettings();
    if (providerSelect && settings.llm_preset) {
        providerSelect.value = settings.llm_preset;
    }
    updateSettingsPillStatus();
    updateListeningModeUI();
    fetchSessions();
});
