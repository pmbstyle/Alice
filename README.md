# Alice

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/pmbstyle/Alice)

Say 'Hi' to Alice 👋

Alice is an open-source AI assistant that offers voice interaction, text-to-speech, and image recognition. It wraps around powerful language and vision APIs to provide natural conversations, perform helpful tasks, and respond to visual inputs with context-aware intelligence.

<p align="center">
  <img src="https://github.com/pmbstyle/Alice/blob/main/animation.gif?raw=true" alt="Alice Animation">
</p>

## Features

- 🗣️ **Voice recognition**
  
  Speak to Alice using voice with Voice Activity Detection (VAD), transcribed via Groq's Whisper API.
  
- 💬 **Text-to-speech**
  
  Alice responds with natural-sounding speech using OpenAI's TTS API.
  
- 🖼️ **Image recognition**
  
  Capture screenshots and let Alice interpret them using OpenAI's Vision API.
  
- 📝**Memory system**
  
  All Alice interactions are stored in a local database, allowing her to remember past conversations and facts.
  
  - **Thoughts:** Past conversation fragments embedded in a local Hnswlib vector database for quick context inspiration.  
  - **Memories:** Long-term structured facts stored in a local database, retrievable on demand via memory tools.
- 🎞️ **Animated assistant appearance**
  
  Several video states (standby, thinking, speaking) are used to make interactions lively.
  
- ⚙️ **Function calling**
  
  Data retrieval:
  - Web search
  - Google calendar integration
  - Gmail integration
  - Torrent search
  - Current date and time awareness

  Computer and software use:
  - MCP support
  - Image generation
  - Open applications
  - Open URLs
  - Read/write clipboard content
  - Add torrents to the download client

## Download

**Get the latest version of Alice for your operating system:**

[![download_btn](https://github.com/user-attachments/assets/3790ee40-2bb5-4d5c-abb8-ed9f8d37a228)](https://github.com/pmbstyle/Alice/releases/latest)

Use [Setup Instructions](https://github.com/pmbstyle/Alice/blob/main/docs/setupInstructions.md) to create all needed API references and set up your assistant.

## Technologies Used

- [Vue.js](https://vuejs.org/) (Frontend framework)
- [Electron](https://www.electronjs.org/) (Desktop app framework)
- [Pinia](https://pinia.vuejs.org/) (App state management)
- [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) (GPT-4.1-mini, TTS, Vision)
- [Groq API](https://console.groq.com/) (Whisper: speech-to-text)
- [Hnswlib](https://github.com/nmslib/hnswlib) (Vector database for thought retrieval)
- [ChatGPT 4o](https://chat.openai.com) (Native image generation: Alice image)
- [Kling 1.6 Pro (fal.ai)](https://fal.ai/) (Image-to-video animation: Alice's animated states)

Tools:

- [Jackett](https://github.com/Jackett/Jackett) (Torrent search aggregation)
- [qBittorrent](https://www.qbittorrent.org/) (Torrent client for downloads)

## Getting Started With Development

1. Clone the repository:  
   `git clone https://github.com/pmbstyle/Alice.git`
2. Install dependencies:  
   `npm install`
3. Use [Setup Instructions](https://github.com/pmbstyle/Alice/blob/main/docs/setupInstructions.md) to create all needed API references and set up your environment variables in a `.env` file.  
   **Note: You can use the example `.env.example` file as a reference.**
4. Run the development server:  
   `npm run dev`

## Local build for production

1. Create `app-config.json` file in the root directory with the following content to use Google integration (optional):

```json

{
  "VITE_GOOGLE_CLIENT_ID": "",
  "VITE_GOOGLE_CLIENT_SECRET": ""
}

```

1. Build the Electron app:  
   `npm run build`

1. Install the app from the `release` folder.
