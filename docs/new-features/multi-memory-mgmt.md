# Profile-Based Memory System Implementation Plan

## Overview

Implement a profile-based memory system that allows users to switch between different work contexts (e.g., "Work 1", "Work 2", "General"). Each profile maintains isolated memories and conversation context while sharing the same conversation history view.

### User Requirements
- ✅ **Explicit switching**: User manually selects which profile to use
- ✅ **Shared history, filtered context**: All conversations visible, but Alice only retrieves profile-specific memories as context
- ✅ **Profile-scoped memories**: Memories saved via `save_memory` tool are profile-specific
- ✅ **Full UI management**: Settings panel to create, delete, rename profiles

---

## Architecture Design

### Database Changes

#### 1. New Profiles Table
```sql
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  color TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL
);
CREATE INDEX idx_profiles_name ON profiles (name);
```

#### 2. Add Profile IDs to Existing Tables
```sql
-- Add to thoughts table
ALTER TABLE thoughts ADD COLUMN profile_id TEXT DEFAULT 'profile_default_general';
CREATE INDEX idx_thoughts_profile_id ON thoughts (profile_id);

-- Add to long_term_memories table
ALTER TABLE long_term_memories ADD COLUMN profile_id TEXT DEFAULT 'profile_default_general';
CREATE INDEX idx_ltm_profile_id ON long_term_memories (profile_id);
```

**Migration Strategy:**
- Use existing `migration_flags` pattern (see line 100-104 in thoughtVectorStore.ts)
- All existing data automatically gets `profile_default_general` via DEFAULT clause
- Create migration function `runProfileSupportMigration()` after `runDualEmbeddingMigration()` (line 118)

**HNSW Index Strategy:**
- Keep single index per provider (simpler implementation)
- Filter results by `profile_id` after HNSW retrieval
- Trade-off: May return fewer results if many belong to other profiles (acceptable for v1)

---

## Implementation Files

### Phase 1: Backend - Database & Core Logic

#### File 1: `electron/main/thoughtVectorStore.ts`
**Lines to modify:** 69-118, 612-677, 679-725

**Changes:**
1. Add `runProfileSupportMigration()` after line 118:
   - Create profiles table
   - Insert default profile: `{ id: 'profile_default_general', name: 'General', is_default: 1 }`
   - Add profile_id columns to thoughts and long_term_memories
   - Create indexes
   - Set migration flag 'profile_support_migrated'

2. Modify `addThoughtVector()` signature (line 612):
   ```typescript
   export async function addThoughtVector(
     conversationId: string,
     role: string,
     textContent: string,
     embedding: number[],
     provider: 'openai' | 'local' = 'openai',
     profileId: string = 'profile_default_general'  // NEW
   ): Promise<void>
   ```
   - Update `insertThoughtMetadata()` call to include profile_id

3. Modify `searchSimilarThoughts()` signature (line 679):
   ```typescript
   export async function searchSimilarThoughts(
     queryEmbedding: number[],
     topK: number,
     provider?: 'openai' | 'local' | 'both',
     profileId?: string  // NEW
   ): Promise<ThoughtMetadata[]>
   ```
   - Update `getThoughtMetadataByLabels()` to filter by profile_id in SQL WHERE clause

4. Add profile_id to `ThoughtMetadata` interface

#### File 2: `electron/main/profileManager.ts` (NEW FILE)
**Purpose:** Centralized profile CRUD operations

**Functions to implement:**
```typescript
import { getDBInstance } from './thoughtVectorStore'
import { randomUUID } from 'node:crypto'

export interface Profile {
  id: string
  name: string
  created_at: string
  updated_at: string
  is_default: number
  color: string | null
  description: string | null
}

export async function listProfiles(): Promise<Profile[]>
export async function getProfileById(id: string): Promise<Profile | null>
export async function getDefaultProfile(): Promise<Profile | null>
export async function createProfile(payload: { name: string, color?: string, description?: string }): Promise<Profile>
export async function updateProfile(id: string, payload: { name?: string, color?: string, description?: string }): Promise<Profile | null>
export async function deleteProfile(id: string): Promise<boolean>
```

**Validation rules:**
- Profile names must be unique
- Cannot delete default profile (is_default = 1)
- Cannot delete profile with existing data (check thoughts/memories count)
- Name length: 1-50 characters

#### File 3: `electron/main/memoryManager.ts`
**Lines to modify:** 83-127, 129-253

**Changes:**
1. Add `profileId` parameter to all functions:
   - `saveMemoryLocal()` - line 83
   - `getRecentMemoriesLocal()` - line 129
   - `updateMemoryLocal()` - line 255
   - `deleteMemoryLocal()` - line 322

2. Update SQL queries to include `WHERE profile_id = ?` filter

3. Add profile_id to `MemoryRecord` interface

#### File 4: `electron/main/ipcManager.ts`
**Lines to modify:** 130-163, 165-200, 301-418

**Changes:**

1. **New Profile Handlers** (add after line 418):
```typescript
// Profile management
ipcMain.handle('profiles:list', async () => {
  try {
    const profiles = await listProfiles()
    return { success: true, data: profiles }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('profiles:create', async (event, payload) => {
  // Call createProfile()
})

ipcMain.handle('profiles:update', async (event, { id, payload }) => {
  // Call updateProfile()
})

ipcMain.handle('profiles:delete', async (event, { id }) => {
  // Call deleteProfile()
})
```

2. **Update Existing Handlers:**
   - `thoughtVector:add` (line 130): Add profileId to parameters
   - `thoughtVector:search` (line 165): Add profileId to parameters
   - `memory:save` (line 301): Add profileId to parameters
   - `memory:get` (line 335): Add profileId to parameters
   - `memory:update` (line 369): Add profileId to parameters

#### File 5: `electron/main/settingsManager.ts`
**Add to AppSettings interface:**
```typescript
export interface AppSettings {
  // ... existing fields ...
  activeProfileId?: string  // NEW
}
```

---

### Phase 2: Frontend - Settings & State

#### File 6: `src/stores/settingsStore.ts`
**Lines to modify:** 22-93 (AliceSettings interface), 267+ (defaultSettings)

**Changes:**
1. Add to `AliceSettings` interface:
   ```typescript
   activeProfileId: string  // NEW
   ```

2. Add to `defaultSettings` object:
   ```typescript
   activeProfileId: 'profile_default_general'
   ```

#### File 7: `src/composables/useProfiles.ts` (NEW FILE)
**Purpose:** Reactive profile state management

```typescript
import { ref, computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

export interface Profile {
  id: string
  name: string
  created_at: string
  updated_at: string
  is_default: number
  color: string | null
  description: string | null
}

const activeProfileId = ref<string>('profile_default_general')
const profiles = ref<Profile[]>([])

export function useProfiles() {
  const settingsStore = useSettingsStore()

  async function loadProfiles() {
    const result = await window.ipcRenderer.invoke('profiles:list')
    if (result.success) {
      profiles.value = result.data
    }
  }

  async function setActiveProfile(profileId: string) {
    activeProfileId.value = profileId
    settingsStore.updateSetting('activeProfileId', profileId)
    await settingsStore.saveSettingsToFile()
  }

  async function createProfile(payload: { name: string, color?: string, description?: string }) {
    const result = await window.ipcRenderer.invoke('profiles:create', payload)
    if (result.success) {
      await loadProfiles()
      return result.data
    }
    throw new Error(result.error)
  }

  async function updateProfile(id: string, payload: any) {
    const result = await window.ipcRenderer.invoke('profiles:update', { id, payload })
    if (result.success) {
      await loadProfiles()
      return result.data
    }
    throw new Error(result.error)
  }

  async function deleteProfile(id: string) {
    const result = await window.ipcRenderer.invoke('profiles:delete', { id })
    if (result.success) {
      await loadProfiles()
      return true
    }
    throw new Error(result.error)
  }

  const activeProfile = computed(() =>
    profiles.value.find(p => p.id === activeProfileId.value)
  )

  return {
    profiles,
    activeProfileId,
    activeProfile,
    loadProfiles,
    setActiveProfile,
    createProfile,
    updateProfile,
    deleteProfile,
  }
}
```

---

### Phase 3: Frontend - Services Integration

#### File 8: `src/services/apiService.ts`
**Lines to modify:** 630-656, 665-679

**Changes:**
1. Modify `indexMessageForThoughts()` (line 630):
   ```typescript
   export const indexMessageForThoughts = async (
     conversationId: string,
     role: string,
     message: any,
     profileId: string  // NEW
   ): Promise<void> => {
     const embedding = await createEmbedding(message)
     // ... existing logic ...

     await window.ipcRenderer.invoke('thoughtVector:add', {
       conversationId,
       role,
       textContent: textContentForMetadata,
       embedding,
       profileId,  // NEW
     })
   }
   ```

2. Modify `retrieveRelevantThoughtsForPrompt()` (line 665):
   ```typescript
   export const retrieveRelevantThoughtsForPrompt = async (
     content: string,
     topK = 3,
     profileId?: string  // NEW
   ): Promise<RetrievedThought[]> => {
     // ... existing logic ...

     const ipcResult = await window.ipcRenderer.invoke('thoughtVector:search', {
       queryEmbedding,
       topK,
       profileId,  // NEW
     })
     // ... return results ...
   }
   ```

#### File 9: `src/stores/conversationStore.ts`
**Lines to modify:** 805-809

**Changes:**
Update the call to `indexMessageForThoughts()` to pass active profile:
```typescript
import { useProfiles } from '../composables/useProfiles'

// Around line 805
if (assistantMessage && shouldIndexAssistantMessage(assistantMessage)) {
  const conversationId = currentResponseId.value || 'default_conversation'
  const { activeProfileId } = useProfiles()  // NEW
  try {
    await api.indexMessageForThoughts(
      conversationId,
      'assistant',
      assistantMessage,
      activeProfileId.value  // NEW
    )
  } catch (error) {
    // ... error handling ...
  }
}
```

#### File 10: `src/modules/conversation/chatOrchestrator.ts`
**Lines to modify:** Around line 337

**Changes:**
Update context retrieval to filter by active profile:
```typescript
import { useProfiles } from '../../composables/useProfiles'

// Around line 337 in buildContextMessages()
if (retrievalSeed) {
  const { activeProfileId } = useProfiles()  // NEW
  const thoughts = await dependencies.retrieveThoughtsForPrompt(
    retrievalSeed,
    activeProfileId.value  // NEW - pass profile filter
  )
  if (thoughts.length > 0) {
    // ... existing logic ...
  }
}
```

#### File 11: `src/utils/functionCaller.ts`
**Lines to modify:** 123-128

**Changes:**
Update `save_memory` function to pass active profile:
```typescript
import { useProfiles } from '../composables/useProfiles'

async function save_memory(args: SaveMemoryArgs) {
  const { activeProfileId } = useProfiles()  // NEW

  try {
    // ... existing embedding generation ...

    const result = await window.ipcRenderer.invoke('memory:save', {
      content: args.content,
      memoryType: args.memoryType,
      embeddingOpenAI: generatedEmbeddingOpenAI,
      embeddingLocal: generatedEmbeddingLocal,
      profileId: activeProfileId.value,  // NEW
    })
    // ... existing result handling ...
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
```

---

### Phase 4: Frontend - UI Components

#### File 12: `src/components/ProfileSelector.vue` (NEW FILE)
**Purpose:** Dropdown component for quick profile switching

**Features:**
- Dropdown showing all profiles
- Current profile highlighted
- Color indicator next to each profile name
- "Manage Profiles" link at bottom
- Place in main chat header next to settings button

**Template structure:**
```vue
<template>
  <div class="profile-selector">
    <div class="dropdown dropdown-end">
      <label tabindex="0" class="btn btn-ghost btn-sm gap-2">
        <div v-if="activeProfile?.color" class="w-3 h-3 rounded-full" :style="{ backgroundColor: activeProfile.color }"></div>
        <span>{{ activeProfile?.name || 'Select Profile' }}</span>
        <ChevronDownIcon class="w-4 h-4" />
      </label>
      <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-200 rounded-box w-52 mt-2">
        <li v-for="profile in profiles" :key="profile.id">
          <a @click="switchProfile(profile.id)" :class="{ 'active': profile.id === activeProfileId }">
            <div v-if="profile.color" class="w-3 h-3 rounded-full" :style="{ backgroundColor: profile.color }"></div>
            {{ profile.name }}
          </a>
        </li>
        <div class="divider my-1"></div>
        <li><a @click="openProfileManager">⚙️ Manage Profiles</a></li>
      </ul>
    </div>
  </div>
</template>
```

**Placement:** Add to main chat interface - look for similar components like settings button

#### File 13: `src/components/settings/ProfileManagementTab.vue` (NEW FILE)
**Purpose:** Full profile management UI in settings

**Features:**
- List all profiles in a table/cards
- Create new profile button → modal with form (name, color picker, description)
- Edit button per profile
- Delete button per profile (with confirmation, disabled for default profile)
- Show default profile badge
- Display memory/thought count per profile (read-only info)

**UI Layout:**
```
┌─────────────────────────────────────────────────┐
│ Profile Management                              │
│                                                 │
│ [+ Create New Profile]                          │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │ 🟢 General (Default)                      │  │
│ │ 12 memories • 45 thoughts                 │  │
│ │                          [Edit] [Delete]  │  │
│ └───────────────────────────────────────────┘  │
│                                                 │
│ ┌───────────────────────────────────────────┐  │
│ │ 🔵 Work 1                                 │  │
│ │ Backend development work                  │  │
│ │ 8 memories • 23 thoughts                  │  │
│ │                          [Edit] [Delete]  │  │
│ └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

#### File 14: Update `src/components/Settings.vue`
**Add new tab button:**
```vue
<button
  type="button"
  class="tab"
  :class="{ 'tab-active': activeTab === 'profiles' }"
  @click="activeTab = 'profiles'"
>
  👤 Profiles
</button>
```

**Add component in tab content area:**
```vue
<ProfileManagementTab v-if="activeTab === 'profiles'" />
```

#### File 15: `src/components/MemoryManager.vue`
**Lines to modify:** Around lines 142, 211-216

**Changes:**
1. Add profile filter dropdown at top
2. Display profile badge on each memory item
3. Pass activeProfileId when saving new memories

**Example additions:**
```vue
<!-- Add filter at top -->
<div class="mb-4 flex gap-2">
  <select v-model="filterProfileId" class="select select-bordered">
    <option value="">All Profiles</option>
    <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
      {{ profile.name }}
    </option>
  </select>
</div>

<!-- Display badge on each memory -->
<span class="badge badge-sm" :style="{ backgroundColor: getProfileColor(memory.profileId) }">
  {{ getProfileName(memory.profileId) }}
</span>
```

---

## Data Migration & Behavior

### Existing User Data
- All existing thoughts and memories automatically get `profile_id = 'profile_default_general'`
- No data loss
- Users see all their existing data under "General" profile

### Profile Switching Behavior
- **Conversations:** Always visible in history (no filtering)
- **Thought retrieval:** Filtered by active profile during semantic search
- **Memory retrieval:** Filtered by active profile in queries
- **RAG documents:** NOT filtered (documents are global)
- **Settings:** NOT filtered (settings are global)

### Profile Deletion Protection
- Cannot delete default profile
- Cannot delete profile with existing thoughts/memories
- Show error message with count of items that would be lost

---

## Verification & Testing

### Manual Testing Checklist

1. **Database Migration:**
   - [ ] Fresh install: profiles table created
   - [ ] Existing install: data migrated to 'profile_default_general'
   - [ ] Migration flag set correctly
   - [ ] Indexes created

2. **Profile Management:**
   - [ ] Create profile with valid name
   - [ ] Create profile with duplicate name (should fail)
   - [ ] Create profile with color and description
   - [ ] Update profile name/color/description
   - [ ] Delete empty profile (should succeed)
   - [ ] Delete profile with data (should fail)
   - [ ] Delete default profile (should fail)

3. **Profile Switching:**
   - [ ] Switch between profiles via dropdown
   - [ ] Active profile persists after app restart
   - [ ] UI updates to show active profile

4. **Memory Isolation:**
   - [ ] Create memory in Profile A
   - [ ] Switch to Profile B
   - [ ] Verify Profile A memory NOT shown in memory manager (when filtered)
   - [ ] Use save_memory tool in Profile B
   - [ ] Switch back to Profile A
   - [ ] Verify both profiles have separate memories

5. **Context Isolation:**
   - [ ] Have conversation in Profile A about topic X
   - [ ] Switch to Profile B
   - [ ] Ask about topic X
   - [ ] Verify Alice doesn't reference Profile A conversation
   - [ ] Switch back to Profile A
   - [ ] Verify Alice remembers topic X from Profile A

6. **UI Components:**
   - [ ] Profile selector shows in main UI
   - [ ] Profile management tab appears in settings
   - [ ] Color picker works
   - [ ] Profile badges display correctly
   - [ ] Memory manager shows profile filter

### Edge Cases to Test

1. Active profile deleted externally → should fallback to default
2. Settings file has invalid activeProfileId → should fallback to default
3. Profile with 1000+ memories → verify query performance
4. Rapid profile switching → no race conditions
5. Profile name with emojis/special characters
6. Create profile, add data, try to delete (should block)

---

## Critical Files Summary

### Must Create (4 new files):
1. `electron/main/profileManager.ts` - Profile CRUD logic
2. `src/composables/useProfiles.ts` - Profile state management
3. `src/components/ProfileSelector.vue` - Quick switcher
4. `src/components/settings/ProfileManagementTab.vue` - Full management UI

### Must Modify (11 files):
1. `electron/main/thoughtVectorStore.ts` - Add migration, update functions
2. `electron/main/memoryManager.ts` - Add profileId to all functions
3. `electron/main/ipcManager.ts` - Add profile handlers, update existing
4. `electron/main/settingsManager.ts` - Add activeProfileId to settings
5. `src/stores/settingsStore.ts` - Add activeProfileId to store
6. `src/services/apiService.ts` - Pass profileId to IPC calls
7. `src/stores/conversationStore.ts` - Pass profileId when indexing
8. `src/modules/conversation/chatOrchestrator.ts` - Filter context by profile
9. `src/utils/functionCaller.ts` - Pass profileId in save_memory
10. `src/components/Settings.vue` - Add profiles tab
11. `src/components/MemoryManager.vue` - Add profile display/filter

---

## Implementation Sequence

1. **Day 1-2: Database & Backend**
   - Create profileManager.ts
   - Add migration to thoughtVectorStore.ts
   - Update memoryManager.ts functions
   - Add IPC handlers
   - Test backend in isolation

2. **Day 3: Settings Integration**
   - Update settings interfaces
   - Create useProfiles composable
   - Test settings persistence

3. **Day 4: Service Layer**
   - Update apiService.ts
   - Update conversationStore.ts
   - Update chatOrchestrator.ts
   - Update functionCaller.ts
   - Test context filtering

4. **Day 5-6: UI Components**
   - Create ProfileSelector.vue
   - Create ProfileManagementTab.vue
   - Update Settings.vue
   - Update MemoryManager.vue
   - Style and polish

5. **Day 7: Integration Testing**
   - End-to-end testing
   - Edge case testing
   - Performance testing
   - Bug fixes

6. **Day 8: Documentation & Polish**
   - User documentation
   - Code comments
   - Demo video

---

## Notes & Considerations

### Performance
- HNSW indices not partitioned by profile (acceptable for v1)
- If profiles have 1000s of thoughts, consider adding profile-specific indices in v2
- Current approach: fetch topK from HNSW, filter by profile, return what matches

### Future Enhancements (not in scope)
- Bulk reassign memories/thoughts between profiles
- Profile-specific summaries
- Export/import profile data
- Profile templates
- Auto-switching based on keywords (hybrid mode)

### Known Limitations
- If HNSW returns 5 results but only 2 match active profile, user gets 2 results (not 5)
- Solution: Could fetch topK*3 internally then filter, but adds complexity

---

**End of Plan**
