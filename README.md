# Alice

Say 'Hi' to Alice 👋

Alice is an open-source AI assistant that offers voice interaction, text-to-speech, and image recognition. It leverages powerful language and vision APIs to facilitate natural conversations, perform helpful tasks, and respond to visual inputs with deep context-aware intelligence.

The goal of this project is to create a personal AI assistant that is pleasant to use and interact with. Not a soulless chatbot, but as much "real" AI companion as possible.

<p align="center">
  <img src="https://github.com/pmbstyle/Alice/blob/main/animation.gif?raw=true" alt="Alice Animation">
</p>

## Features

- 🗣️ **Voice recognition**  
  Speak to Alice using voice with fast Voice Activity Detection (VAD), transcribed via OpenAI's gpt-4o-transcribe or Groq's whisper-large-v3 API.

- 💬 **Text-to-speech**  
  Alice responds with natural-sounding speech using OpenAI's TTS API.

- 🖼️ **Image recognition & Image generation**  
  Capture screenshots and let Alice interpret them using OpenAI's Vision API. Generate images using OpenAI gpt-image-1.

- 📝 **Memory system**  
  All Alice interactions are stored in a local database, allowing her to remember past conversations and facts.  
  - **Thoughts:** Past conversation fragments embedded in a local Hnswlib vector database for quick context inspiration.  
  - **Memories:** Long-term structured facts stored in a local database, retrievable on demand via memory tools.  
  - **Summarization:** Past messages are automatically summarized and served to Alice for longer context awareness.
  - **User emotion awareness:** Summarization includes a user emotion summary, enabling more empathetic replies.

- 🎞️ **Animated assistant appearance**  
  Several video states (standby, thinking, speaking) are used to make interactions lively.

- 🪪 **Advanced system prompt**  
  Alice comes with an advanced system prompt that allows a seamless user experience and tool usage. The system prompt can be updated in settings at any time.

- ⏹️ **Interruptible responses**  
  Yes, kinda Realtime API but much cheaper to use ;) Alice can cancel her response mid-stream when interrupted with voice input, including both text and TTS pipelines.

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

- 📃 **Flexible settings**  
  Configure Alice for your needs, including:  
  - Model  
  - System prompt  
  - Temperature  
  - Top P  
  - Max History Messages  
  - Summarization Message Count  
  - Summarization Model  
  - Summarization System Prompt  
  - Microphone/Audio toggle, take screenshot hot keys  
  - Available tools  
  - MCP servers  
  - Google integration

## Download

**Get the latest version of Alice for your operating system:**

[![download_btn](https://github.com/user-attachments/assets/3790ee40-2bb5-4d5c-abb8-ed9f8d37a228)](https://github.com/pmbstyle/Alice/releases/latest)

Use [Setup Instructions](https://github.com/pmbstyle/Alice/blob/main/docs/setupInstructions.md) to create all needed API references and set up your assistant.

## Technologies Used

- [Vue.js](https://vuejs.org/) (Frontend framework)
- [Electron](https://www.electronjs.org/) (Desktop app framework)
- [Pinia](https://pinia.vuejs.org/) (App state management)
- [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) (Responses API, TTS, Vision, Image generation, etc ..)
- [Groq API](https://console.groq.com/) (Whisper-large-v3: fast speech-to-text)
- [Hnswlib](https://github.com/nmslib/hnswlib) (Vector database for thought retrieval)
- [VAD](https://github.com/ricky0123/vad) (Voice Activity Detection)
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

Create `app-config.json` file in the root directory with the following content to use Google integration (optional):

```json

{
  "VITE_GOOGLE_CLIENT_ID": "",
  "VITE_GOOGLE_CLIENT_SECRET": ""
}

```

1. Build the Electron app:  
   `npm run build`

2. Install the app from the `release` folder.


## Community links
- [ArchLinux port](https://aur.archlinux.org/packages/alice-ai-app-bin)

## Contributing
I welcome your ideas, suggestions, and pull requests!
Whether it’s a bug fix, a feature idea, or just a creative thought — feel free to open an issue or a PR.
Your input helps make Alice smarter and more helpful for everyone 💚
