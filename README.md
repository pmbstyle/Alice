# Alice

Say 'Hi' to Alice 👋

Alice App is a Vue.js/Electron.js application (OpenAI/Groq/Pinecone wrapper) that provides an interactive AI assistant with voice recognition, text-to-speech, and image recognition capabilities. It utilizes OpenAI's GPT-4o language model and various APIs for natural language processing, speech recognition, function calling, and computer vision tasks.
This project was created and maintained for personal use and shared with the community.

<p align="center">
  <img src="https://github.com/pmbstyle/Alice/blob/main/animation.gif?raw=true" alt="Alice Animation">
</p>

## Features

- **Voice recognition:** Users can speak to Alice, and their speech is transcribed into text using Groq's Whisper API.
- **Text-to-speech:** Alice can respond with synthesized speech using OpenAI's TTS API.
- **Image recognition:** Users can take screenshots, and Alice can recognize the contents of the image using OpenAI's Vision API.
- **Conversation history:** The application stores and retrieves relevant conversation history to provide context-aware responses.
- **Pinecone vector database:** Conversation messages are embedded and stored in a Pinecone vector database to retrieve relevant memories efficiently.
- **Animated assistant appearance:** Using prerendered AI-generated videos
- **Function calling:** Alice can perform web searches, crawl/scrape web page content, open apps or URLs on the user's PC, and manage clipboard content.

## Technologies Used

- [Vue.js](https://vuejs.org/) (JS framework)
- [Pinia](https://pinia.vuejs.org/) (State Management)
- [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) (GPT-4o-mini, TTS, Vision)
- [Groq API](https://console.groq.com/) (Whisper)
- [Pinecone](https://www.pinecone.io/) (Vector Database)
- [Electron](https://www.electronjs.org/) (Desktop Application framework)
- [ChatGPT 4o](https://chat.com) (Native image generation)
- [Kling 1.6 pro (fal.ai)](https://fal.ai/) (Image-to-video)
- [Crawl4AI](https://github.com/unclecode/crawl4ai) (Web Crawler & Scraper)

## TODO
- add a settings menu
- add an option to choose vector DB provider/source
- add a real-time API option with the audio-to-audio interface and video(screen-sharing/camera) input
- add the ability to output images and other media content
- make Alice animations real-time with the lip sync
- something else ... depends on where the technology will be at the moment

## Getting Started

1. Clone the repository: `git clone https://github.com/pmbstyle/Alice.git`
2. Install dependencies: `npm install`
3. Setup an assistant on the [OpenAI platform](https://platform.openai.com/assistants), add tools if needed
4. Set up environment variables with your OpenAI & Groq and Pinecone API keys.
5. (optional) Set up environment variables for tool calling (you can define tools to use in the [Assistant API dashboard](https://platform.openai.com/assistants))
6. Run the development server: `npm run dev`
7. Build the Electron app: `npm run build`
8. Install the app from the `release` folder
9. Enjoy =)

Feel free to open an issue or contact me directly to help you figure out how to set it up.
