#  OpenAI Assistant setup

-  Go to [OpenAI Platform](https://platform.openai.com/assistants)

-  Create New project or use existing one

-  Create new Assistant

	- Define assistant name
	- Add assistant system prompt, use [example](https://github.com/pmbstyle/Alice/blob/main/docs/systemPrompt.md) as reference
	- Select `gpt-4.1-mini`
	- Keep responce format `text`
	- Set temperature to `0.5` and Top P `1`
	- Define needed [tools](https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md) using this document (optional)

- Create `.env` file in project root
	- Take assistant ID from your assitant url and paste it as `VITE_OPENAI_ASSISTANT_ID` in your env
	- Go to [API keys](https://platform.openai.com/settings/organization/api-keys) section and generate new API key, paste it as `VITE_OPENAI_API_KEY`
	- Get your organization ID from [Organization settings](https://platform.openai.com/settings/organization/general) and paste it as `VITE_OPENAI_ORGANIZATION`
	- Get your project ID from [Organization->Projects](https://platform.openai.com/settings/organization/projects) tab and paste is as `VITE_OPENAI_PROJECT`

# Groq TTS setup

- Go to [Groq cloud console](https://console.groq.com/home)  and set up your account
- Get your API key from [API keys](https://console.groq.com/keys) section and paste is as `VITE_GROQ_API_KEY`

# Pinecone setup

- Go to [Pinecone](https://www.pinecone.io/) and set up your account
- Create new index in database section and get it's url, paste as `VITE_PINECONE_BASE_URL`
- Paste DB region as `VITE_PINECONE_ENV` and index name as `VITE_PINECONE_INDEX`
- Create your API key and paste it as `VITE_PINECONE_API_KEY` 

# Supabase setup

- Go to [Supabase](https://supabase.com/) and set up free account
- Create new project
- Create new database and paste it's url as `VITE_SUPABASE_URL` from API Settings
- Paste your API key as `VITE_SUPABASE_KEY`


At this point you are all set.
Continue with [tools](https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md) setup if not done it during previous steps (optional).