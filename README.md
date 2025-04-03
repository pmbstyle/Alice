# Alice

Say 'Hi' to Alice 👋

Alice App is a Vue.js/Electron.js application (OpenAI/Groq/Pinecone wrapper) that provides an interactive AI assistant with voice recognition, text-to-speech, and image recognition capabilities. It utilizes OpenAI's GPT-4o language model and various APIs for natural language processing, speech recognition, and computer vision tasks.
This project was created and maintained for personal use and shared with the community.

<p align="center">
  <img src="https://github.com/pmbstyle/Alice/blob/main/screenshot.png?raw=true" alt="Alice Screenshot">
</p>

## Features

- **Voice recognition:** Users can speak to the AI assistant, and their speech is transcribed into text using Groq's Whisper API.
- **Text-to-speech:** The AI assistant can respond with synthesized speech using OpenAI's TTS API.
- **Image recognition:** Users can take screenshots, and the AI assistant can recognize the contents of the image using OpenAI's Vision API.
- **Conversation history:** The application stores and retrieves relevant conversation history to provide context-aware responses.
- **Pinecone vector database:** Conversation messages are embedded and stored in a Pinecone vector database to retrieve relevant memories efficiently.
- **Animated assistant appearance:** Using prerendered AI-generated videos

## Technologies Used

- [Vue.js](https://vuejs.org/) (JS framework)
- [Pinia](https://pinia.vuejs.org/) (State Management)
- [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) (GPT-4o-mini, TTS, Vision)
- [Groq API](https://console.groq.com/) (Whisper)
- [Pinecone](https://www.pinecone.io/) (Vector Database)
- [Electron](https://www.electronjs.org/) (Desktop Application framework)

## Getting Started

1. Clone the repository: `git clone https://github.com/pmbstyle/Alice.git`
2. Install dependencies: `npm install`
3. Set up environment variables with your OpenAI & Groq and Pinecone API keys.
4. Run the development server: `npm run dev`
5. Build the Electron app: `npm run build`
6. Install the app from the `release` folder
7. Enjoy =)
