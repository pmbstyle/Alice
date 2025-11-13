If you downloaded Alice setup files from git releases, you can see some OS warnings when running the setup.

There is nothing to be afraid of; the reason for these warnings is the missing paid code signing certification that Apple and Microsoft want from developers.

Follow these simple instructions to run the setup.

## 🪟 Windows, run an unsigned app

If you see Windows standard warning that the app publisher is unknown, click 'More info' and 'Run anyway'.

## 🍎 MacOS, run an unsigned app

Run in your terminal `xattr -cr "/Applications/Alice AI App.app"`

# AI Provider Setup

Alice supports OpenAI, OpenRouter and local LLM inference.

## OpenAI (Default)

- Go to [OpenAI Platform](https://platform.openai.com/api-keys)
- Get OpenAI API key and add it to settings
- You might need to [verify your organization](https://platform.openai.com/settings/organization/general) for image generation
- Supports GPT models with image generation, TTS, and STT

## OpenRouter (Alternative)

- Go to [OpenRouter Platform](https://openrouter.ai/keys) to get your OpenRouter API key
- Access to 400+ models from various providers including Claude, Llama, Gemini, and more
- Set up either OpenAI speech to text or use built-in local voice generation
- Models automatically include web search capabilities
- No image generation support (use OpenAI provider for image-gen)

## Local Ollama / LM studio

- Run Ollama or LM studio
- Select "AI Provider" in Core Settings as Ollama or LM studio and Base URL (ex. `http://localhost:11434`)
- In AI tab hit "Refresh Models" and select preferred model from the list
- Select a model for summarization
- Optional but highly recommended - activate Web search tool by using Tavily or SearXNG and add corresponding API keys and base URLs
- No image generation support (use OpenAI provider for image-gen)

# Groq STT setup (optional)

- Go to [Groq cloud console](https://console.groq.com/home) and set up your account
- Get your API key from [API keys](https://console.groq.com/keys) section and paste it in settings

# Google services connection (optional)

- In settings, click 'Connect to Google Services', authorize your Google account to connect to Alice

Continue with [tools](https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md) setup if not done during previous steps (optional).
