# MacOS, run an unsigned app

Run in your terminal `xattr -cr /Applications/Alice\ app.app`

#  OpenAI Assistant setup

- Go to [OpenAI Platform](https://platform.openai.com/assistants)
- Get OpenAI API key and add it to settings.

# Groq STT setup

- Go to [Groq cloud console](https://console.groq.com/home)  and set up your account
- Get your API key from [API keys](https://console.groq.com/keys) section and paste it in settings

# Pinecone setup

- Go to [Pinecone](https://www.pinecone.io/) and set up your account
- Create a new index in the database section and get its URL, paste it in the settings
- Paste DB region as `VITE_PINECONE_ENV` and index in settings
- Create your API key and paste it into settings

# Supabase setup

- Go to [Supabase](https://supabase.com/) and set up free account
- Create a new project
- Create a new database and paste its URL in settings
- Paste your API key in settings

# OpenAI Assistant setup

-  Save and test settings, then select `Manage assistants` option
- Create a new assistant
- Define the assistant's name
- Add assistant system prompt, use [example](https://github.com/pmbstyle/Alice/blob/main/docs/systemPrompt.md) as reference
- Select `gpt-4.1-mini` or any other model that suits you best
- Set temperature to `0.5` and Top P `1` or experiment with what will suit your needs best
- Select needed [tools](https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md) using this document (optional)

At this point, you are all set.
Continue with [tools](https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md) setup if not done it during previous steps (optional).
