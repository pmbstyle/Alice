# Alice

Say 'Hi' to Alice 👋

Alice is an open-source AI assistant that offers voice interaction, text-to-speech, and image recognition. It wraps around powerful language and vision APIs to provide natural conversations, perform helpful tasks, and respond to visual inputs with context-aware intelligence.

<p align="center">
  <img src="https://github.com/pmbstyle/Alice/blob/main/animation.gif?raw=true" alt="Alice Animation">
</p>

## Features

- **Voice recognition.**
  Speak to Alice using voice with Voice Activity Detection (VAD), transcribed via Groq's Whisper API.
- **Text-to-speech.**
  Alice responds with natural-sounding speech using OpenAI's TTS API.
- **Image recognition.**
  Capture screenshots and let Alice interpret them using OpenAI's Vision API.
- **Memory system.**  
  - **Thoughts:** Past conversation fragments embedded in a Pinecone vector database for quick context inspiration.  
  - **Memories:** Long-term structured facts stored in a Supabase database, retrievable on demand via memory tools.
- **Animated assistant appearance.**
  Several video states (standby, thinking, speaking) are used to make interactions lively.
- **Function calling.**  
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

## Download

**Get the latest version of Alice for your operating system:**

[**➡️ Download Latest Release**](https://github.com/pmbstyle/Alice/releases/latest) (Windows, MacOS, Linux)



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

## Getting Started With Development

1. Clone the repository:  
   `git clone https://github.com/pmbstyle/Alice.git`
2. Install dependencies:  
   `npm install`
3. Use [Setup Instructions](https://github.com/pmbstyle/Alice/blob/main/docs/setupInstructions.md) to create all needed API references and set up your environment variables in a `.env` file.  
   **Note: You can use the example `.env.example` file as a reference.**
4. Run the development server:  
   `npm run dev`
   
## Build for production
1. Build the Electron app:  
   `npm run build`
2. Install the app from the `release` folder.
