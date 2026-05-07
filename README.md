# Alice

<img src="https://img.shields.io/github/license/pmbstyle/alice"> <img src="https://img.shields.io/github/v/release/pmbstyle/alice"> <img src="https://img.shields.io/github/downloads/pmbstyle/Alice/total">

Say "Hi" to Alice 👋, your open-source AI companion designed to live on your desktop.

Alice brings together voice interaction, intelligent context awareness, powerful tooling, and a friendly personality to assist you with everything from daily tasks to deeper creative work.
Alice is more than a chatbot; she’s built to feel present, responsive, emotionally engaging, and deeply useful.

## Quick showcase
<p align="center">
  <a href="https://www.youtube.com/watch?v=fDYUjh6UXqk">
    <img width="817" height="504" alt="AliceVideo" src="https://github.com/user-attachments/assets/9e0ffee2-198a-43a0-9f9a-a003d221e31d" />
  </a>
</p>

## ✨ Key Features

### 💻 Local and Cloud use

Alice is designed to work with Cloud(OpenAI/OpenRouter/Z.ai/Minimax) and Local LLMs (Ollama/LM Studio).
Has built-in speech-to-text, text-to-speech, and embedding services.
While the OpenAI cloud API is preferred and provides the best user experience, Alice can also operate **fully locally** (experimental).

### 🗣️ Voice Interaction

* Fast, VAD-powered voice recognition (via `gpt-4o-transcribe`, `google-tts-voice` or `whisper-large-v3`)
* Natural-sounding responses with OpenAI/Google TTS and optional support for local multilingual text-to-speech via Piper TTS
* Interruptible speech and streaming response cancellation for smoother flow

### 🧠 Memory & Context

* **Thoughts**: Short-term context stored in Hnswlib vector DB
* **Memories**: Structured long-term facts in local DB
* **Summarization**: Compact message history into context prompts
* **Emotion awareness**: Summaries include mood estimation for more human responses
* **Local RAG**: Add local documents to the LLM context, chat with your docs

### 🎨 Vision & Visual Output

* Screenshot interpretation using Vision API
* Image generation using `gpt-image-2`
* Animated video states (standby/speaking/thinking)

### 🪄 Computer Use Tools

Alice can interact with your local system with user-approved permissions:

* 📂 File system browsing (e.g., listing folders)
* 💻 Shell command execution (`ls`, `mv`, `mkdir`, etc)
* 🔐 Granular command approvals:

  * One-time
  * Session-based
  * Permanent (revocable)
* 🔧 Settings tab "Permissions" lets you review and manage all approved commands

### ⚙️ Function Calling

* Web search (including Searxng support)
* Google Calendar & Gmail integration
* Torrent search & download (via Jackett + qBittorrent)
* Time & date awareness
* Clipboard management
* Task scheduler (reminders and command execution)
* Open applications & URLs
* Image generation
* MCP server support

### 💬 Wake Word Support  
With the local STT model, you can set a **wake-up word** (like "Hey, Siri").  
- Alice will always listen, but only process requests when the wake word is spoken.  
- Default mode is **auto language detection**, but you can also select a specific language in settings. 

### 💻 Dedicated Chrome [Extension](https://github.com/pmbstyle/alice-chrome-extension)

* Ask Alice about your active Chrome tab
* Context menu for selected text on a web page
  - Fact check this
  - Summarize this
  - Tell me more about it

### 🎛️ Flexible Settings

Fully customizable settings interface:

* LLM provider selection between OpenAI, OpenRouter, Z.ai(coding plan), Minimax(token plan), Ollama, LM Studio
* Cloud or local TTS, STT, Embeddings
* Model choice & parameters (temperature, top\_p, history, etc)
* Prompt and summarization tuning
* Audio/mic toggles & hotkeys
* Available tools & MCP configuration
* Google integrations

### 🔨 Custom Tools

Alice supports [custom tools](https://github.com/pmbstyle/Alice/blob/main/docs/custom-tools.md) that are defined in JSON and backed by local scripts.

1. Open *Settings → Customization → Custom tools*
2. Upload or drop your script (writes to `custom-tool-scripts/`)
3. Click **Add Tool**, fill in metadata, and paste the JSON schema. Saving updates `custom-tools.json`
4. Toggle the tool on/off in the list. Only enabled + valid entries are offered to the model.

### 🎭 Custom Avatars

Swap Alice's appearance with [your own](https://github.com/pmbstyle/Alice/blob/main/docs/custom-avatars.md) video loops:

1. Create a folder under `user-customization/custom-avatars/<AvatarName>/`.
2. Drop `speaking.mp4`, `thinking.mp4`, and `standby.mp4` into that folder (all required).
3. Open **Settings → Customization → Assistant Avatar**, hit **Refresh**, and pick the new avatar.

## 🚀 Download

👉 **[Download the latest release](https://github.com/pmbstyle/Alice/releases/latest)**

<!-- STABLE_DOWNLOADS -->
| Platform | Download |
|----------|----------|
| **Windows** | [Alice-AI-App-Windows-1.4.0-Setup.exe](https://github.com/pmbstyle/Alice/releases/download/v1.4.0/Alice-AI-App-Windows-1.4.0-Setup.exe) |
| **macOS** | [Alice-AI-App-Mac-1.4.0-Installer.dmg](https://github.com/pmbstyle/Alice/releases/download/v1.4.0/Alice-AI-App-Mac-1.4.0-Installer.dmg) |
| **Linux** | [Alice-AI-App-Linux-1.4.0.AppImage](https://github.com/pmbstyle/Alice/releases/download/v1.4.0/Alice-AI-App-Linux-1.4.0.AppImage) |
| **ArchLinux**(community build) | [AUR Package](https://aur.archlinux.org/packages/alice-ai-app-bin) |
<!-- STABLE_DOWNLOADS_END -->

Follow the [Setup Instructions](https://github.com/pmbstyle/Alice/blob/main/docs/setupInstructions.md) to configure your API keys and environment.



## 🛠️ Technologies Used

* **Frontend:** [Vue.js](https://vuejs.org/), [TailwindCSS](https://tailwindcss.com/)
* **Desktop Shell:** [Electron](https://www.electronjs.org/)
* **State Management:** [Pinia](https://pinia.vuejs.org/)
* **AI APIs:** [OpenAI](https://platform.openai.com/), [OpenRouter](https://openrouter.ai/), [Groq](https://console.groq.com/)
* **Backend:** [Go](https://go.dev/)
* **Vector search engine**: [hnswlib-node](https://github.com/nmslib/hnswlib)
* **Local storage**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
* **Voice activity detection:** [VAD (Web)](https://github.com/ricky0123/vad)
* **Local STT & TTS:** [whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) & [Piper](https://github.com/rhasspy/piper)
* **Local Embeddings:** [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
* **Animation:** [Kling Pro](https://fal.ai/)

Other tools:

* [Jackett](https://github.com/Jackett/Jackett) — Torrent aggregator
* [qBittorrent](https://www.qbittorrent.org/) — Torrent client
* [Searxng](https://github.com/searxng/searxng) - Self-hosted web search


## 🧑‍💻 Getting Started (Development)

```bash
# 1. Clone the repo
$ git clone https://github.com/pmbstyle/Alice.git

# 2. Install dependencies
$ npm install

# 3. Set up your .env file (see .env.example for reference)
```

Follow [setup instructions](https://github.com/pmbstyle/Alice/blob/main/docs/setupInstructions.md) to obtain required API credentials.

```bash
# 4. Compile backend
npm run build:go

# 5. Run dev environment
$ npm run dev
```

### 📦 Production Build

Optionally, create an `app-config.json` file in the root directory for Google integration:

```json
{
  "VITE_GOOGLE_CLIENT_ID": "",
  "VITE_GOOGLE_CLIENT_SECRET": ""
}
```

```bash
# Build the app
$ npm run build
```

Install the output from the `release/` directory.


## 🤝 Contributing

Ideas, bug reports, feature requests - all welcome! Open an issue or PR, or drop by to share your thoughts. Your input helps shape Alice into something wonderful 💚

## A full app overview with tutorials
<p align="center">
  <a href="https://www.youtube.com/watch?v=aFTjmTRTLUM">
    <img width="846" height="475" alt="image" src="https://github.com/user-attachments/assets/432211d2-d820-437d-9541-8cedbba1f770" />
  </a>
</p>
