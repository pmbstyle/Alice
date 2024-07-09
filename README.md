# Alice App

Alice App is a Vue.js application that provides an interactive AI assistant with voice recognition, text-to-speech, and image recognition capabilities. It utilizes OpenAI's GPT-4 language model and various APIs for natural language processing, speech recognition, and computer vision tasks.

## Features

- Voice recognition: Users can speak to the AI assistant, and their speech is transcribed into text using OpenAI's Whisper API.
- Text-to-speech: The AI assistant can respond with synthesized speech using OpenAI's TTS API.
- Image recognition: Users can take screenshots, and the AI assistant can describe the contents of the image using OpenAI's Vision API.
- Conversation history: The application stores and retrieves relevant conversation history to provide context-aware responses.
- Pinecone vector database: Conversation messages are embedded and stored in a Pinecone vector database for efficient retrieval of relevant memories.

## Technologies Used

- Vue.js
- Pinia (State Management)
- OpenAI API (GPT-4, Whisper, TTS, Vision)
- Pinecone (Vector Database)
- Electron (Desktop Application)

## Getting Started

1. Clone the repository: `git clone https://github.com/pmbstyle/alice-app.git`
2. Install dependencies: `npm install`
3. Set up environment variables with your OpenAI and Pinecone API keys.
4. Run the development server: `npm run dev`
5. Build the Electron app: `npm run build`

## Contributing

Contributions are welcome! Please follow the standard GitHub workflow for contributing to this project:

1. Fork the repository
2. Create a new branch: `git checkout -b my-feature-branch`
3. Make your changes and commit them: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin my-feature-branch`
5. Submit a pull request

## License

This project is licensed under the [MIT License](LICENSE).
