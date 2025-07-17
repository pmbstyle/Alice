# MacOS, run an unsigned app

Run in your terminal `xattr -cr "/Applications/Alice AI App.app"`

# AI Provider Setup

## OpenAI (Default)

- Go to [OpenAI Platform](https://platform.openai.com/api-keys)
- Get OpenAI API key and add it to settings
- You might need to [verify your organization](https://platform.openai.com/settings/organization/general) for image generation
- Supports GPT models with image generation, TTS, and STT

## OpenRouter (Alternative)

- Go to [OpenRouter Platform](https://openrouter.ai/keys) to get your OpenRouter API key
- Access to 400+ models from various providers including Claude, Llama, Gemini, and more
- Requires **both** OpenRouter API key (for chat) and OpenAI API key (for TTS/STT/embeddings)
- Models automatically include web search capabilities
- No image generation support (use OpenAI provider for image-gen)

# Groq STT setup (optional)

- Go to [Groq cloud console](https://console.groq.com/home) and set up your account
- Get your API key from [API keys](https://console.groq.com/keys) section and paste it in settings

# Google services connection

- In settings, click 'Connect to Google Services', authorize your Google account to connect to Alice

Continue with [tools](https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md) setup if not done during previous steps (optional).
