# Custom Avatars

Alice can render any looping video you provide as the assistant’s face. Custom avatars live alongside custom tools, so you don’t need to recompile or fork the app to change the visual style.

## Storage locations

| Mode | Base folder |
| --- | --- |
| Development (`npm run dev`) | `<repo>/user-customization/custom-avatars/` |
| Packaged / production | `<userData>/user-customization/custom-avatars/` (e.g., `%APPDATA%/Alice AI App/user-customization/custom-avatars/` on Windows) |

Each avatar is its own folder under `custom-avatars/`. The folder name is shown in the Settings UI, so keep it short and descriptive (`Android`, `GalaxyAlice`, etc.).

## Required files

Inside every avatar folder create the following MP4 files (lowercase names, `.mp4` extension):

| File | Usage |
| --- | --- |
| `standby.mp4` | Idle/listening state **and** the preview circle in Settings. |
| `speaking.mp4` | When Alice is actively talking. |
| `thinking.mp4` | When Alice is processing / waiting on responses. |

> ⚠️ All three files must exist. If any are missing the folder is ignored.

### Video guidelines

- Use square or portrait-friendly videos so they crop well in the circular mask (the app uses a centered circle).
- Keep loops seamless; the player is muted and loops forever.
- Encode with H.264 MP4 for maximum compatibility.

## Adding a new avatar

1. Create a folder under `custom-avatars/`, e.g. `custom-avatars/Android/`.
2. Drop `standby.mp4`, `speaking.mp4`, and `thinking.mp4` into that folder.
3. In Alice open **Settings → Customization**.
4. In the **Assistant Avatar** fieldset press **Refresh** to rescan the filesystem.
5. Select your new avatar card and click **Save & Reload**.

The choice is persisted in `alice-settings.json`, so it survives restarts.

<img src="https://github.com/pmbstyle/Alice/blob/main/docs/custom-avatars.gif"/>

## How it works

- The renderer never reads from disk directly. Videos play through a custom `alice-avatar://` protocol that safely maps to the `custom-avatars` directory in the Electron main process.
- The general store swaps between `standby/thinking/speaking` clips based on Alice’s audio state, just like the built‑in video.

