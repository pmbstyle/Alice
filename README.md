# Alice

Say 'Hi' to Alice 👋

Alice is a Vue.js/Vite/Electron.js application (OpenAI/Groq/Pinecone wrapper) that provides an interactive AI assistant with voice recognition, text-to-speech, and image recognition capabilities. It utilizes OpenAI's GPT-4.1-mini language model and various APIs for natural language processing, speech recognition, function calling, and vision tasks.

<p align="center">
  <img src="https://github.com/pmbstyle/Alice/blob/main/animation.gif?raw=true" alt="Alice Animation">
</p>

## Features

- **Voice recognition:** Speak to Alice using voice with Voice Activity Detection (VAD), transcribed via Groq's Whisper API.
- **Text-to-speech:** Alice responds with natural-sounding speech using OpenAI's TTS API.
- **Image recognition:** Capture screenshots and let Alice interpret them using OpenAI's Vision API.
- **Memory system:**  
  - **Thoughts:** Past conversation fragments embedded in a Pinecone vector database for quick context inspiration.  
  - **Memories:** Long-term structured facts stored in a Supabase database, retrievable on demand via memory tools.
- **Animated assistant appearance:** Several video states (standby, thinking, speaking) to make interactions lively.
- **Function calling:**  
  Data retrieval:
   - Web search
   - Website content extraction
   - Torrent search
   - Weather checking
   - Current date and time awareness

  Computer and software use:
   - Open applications
   - Open URLs
   - Read/write clipboard content
   - Add torrents to the download client

## Technologies Used

- [Vue.js](https://vuejs.org/) (Frontend framework)
- [Electron](https://www.electronjs.org/) (Desktop app framework)
- [Pinia](https://pinia.vuejs.org/) (App state management)
- [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) (GPT-4.1-mini, TTS, Vision)
- [Groq API](https://console.groq.com/) (Whisper: speech-to-text)
- [Pinecone](https://www.pinecone.io/) (Vector database for thought retrieval)
- [Supabase](https://supabase.com/) (PostgreSQL cloud database for long-term memory storage)
- [ChatGPT 4o](https://chat.openai.com) (Native image generation: Alice image)
- [Kling 1.6 Pro (fal.ai)](https://fal.ai/) (Image-to-video animation: Alice's animated states)

Tools:
- [TavilyAI](https://tavily.com) (Web search and crawler)
- [Jackett](https://github.com/Jackett/Jackett) (Torrent search aggregation)
- [qBittorrent](https://www.qbittorrent.org/) (Torrent client for downloads)

## Getting Started

1. Clone the repository:  
   `git clone https://github.com/pmbstyle/Alice.git`
2. Install dependencies:  
   `npm install`
3. Set up an assistant on the [OpenAI Platform](https://platform.openai.com/assistants), define tools if needed.
4. Set up environment variables with your OpenAI, Groq, Pinecone, and Supabase API keys.
5. (Optional) Set up additional tool keys for web search, torrent management, etc.
6. Run the development server:  
   `npm run dev`
7. Build the Electron app:  
   `npm run build`
8. Install the app from the `release` folder.
9. Enjoy your personal AI companion! 🧠💬

---

Feel free to open an issue or contact me directly if you need help setting Alice up!
