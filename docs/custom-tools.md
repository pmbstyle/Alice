# Custom Tools

Alice supports custom tools that are defined in JSON and backed by local scripts. This document explains where those files live, the JSON format, and the runtime expectations for uploaded scripts.

## Storage locations

| Mode | Base folder |
| --- | --- |
| Development (`npm run dev`) | `<repo>/user-customization/` |
| Packaged / production | `<userData>/user-customization/` (e.g., `%AppData%/Alice AI App/user-customization/`) |

Inside that folder the app maintains:

- `custom-tools.json` – array of custom tool definitions
- `custom-tool-scripts/` – scripts uploaded through the settings UI

> ℹ️ On first run Alice seeds this folder with a disabled `demo_greet_user` tool.
> Enable it from **Settings → Customization** to verify the plumbing before writing your own scripts.

You can drop JSON/scripts manually and then press **Refresh** in *Settings → Customization* to re-validate the set.

## JSON structure

`custom-tools.json` is an array. Each entry looks like:

```json
[
  {
    "id": "weather-tool",
    "name": "fetch_weather_report",
    "description": "Gets today\u2019s forecast for a city",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "City and country, e.g. 'Lisbon, PT'"
        }
      },
      "required": ["city"],
      "additionalProperties": false
    },
    "strict": true,
    "enabled": true,
    "handler": {
      "type": "script",
      "entry": "custom-tool-scripts/weather.js",
      "runtime": "node"
    }
  }
]
```

Required fields:

- `name` – function name exposed to the LLM (use snake_case)
- `description` – surfaced in the settings UI and sent to the LLM
- `parameters` – JSON schema describing accepted args (same structure as OpenAI function tools)
- `handler.entry` – relative path (from the customization root) to a `.js/.mjs/.cjs` file

Optional fields: `id`, `strict`, `enabled`, `tags`, `version`. IDs are auto-generated if missing.

## Script contract

Scripts run inside the Electron main process with Node.js. Export one of the following:

```js
export async function run(args, context) {
  // ... do work
  return { success: true, data: { message: 'Done' } }
}
```

Accepted export names: `run`, `execute`, or a default export function. Each handler receives:

- `args` – parsed arguments from the model
- `context` – helper data: `{ appVersion, customizationRoot, scriptsRoot, userDataPath, log(...) }`

Return either:

- `{ success: true, data?: any }`
- `{ success: false, error: string }`
- Any other value (string/object) which will be stringified automatically

Throwing an error is equivalent to `{ success: false, error }` and will be surfaced to the assistant conversation.

## Workflow

1. Open *Settings → Customization*
2. Upload or drop your script (writes to `custom-tool-scripts/`)
3. Click **Add Tool**, fill in metadata, paste JSON schema. Saving updates `custom-tools.json`
4. Toggle the tool on/off in the list. Only enabled + valid entries are offered to the model.
5. Use **Refresh** to re-read the file after manual edits.
6. The advanced editor lets you edit the JSON directly; the app validates structure before persisting.

## Validation

- Entry paths must stay inside `user-customization/`
- Scripts must exist and use `.js/.mjs/.cjs`
- Only `script` handlers are supported
- Invalid entries stay disabled until fixed. Errors are listed in the Customization tab and in the Assistant tab summary.

