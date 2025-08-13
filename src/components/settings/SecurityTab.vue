<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-red-400">
      Security & Command Permissions
    </h3>

    <fieldset
      class="fieldset bg-gray-900/90 border-red-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Approved Commands</legend>
      <div class="p-2 space-y-4">
        <div class="text-sm text-gray-300 mb-4">
          These commands can be executed by Alice without requiring
          approval. Commands approved "for session" are shown in the
          current session column.
        </div>

        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th>Command</th>
                <th>Approval Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="command in approvedCommands"
                :key="command"
              >
                <td class="font-mono text-sm">{{ command }}</td>
                <td>
                  <span class="badge badge-success badge-sm"
                    >Permanent</span
                  >
                </td>
                <td>
                  <button
                    @click="$emit('remove-command', command)"
                    class="btn btn-error btn-xs"
                    title="Remove command"
                  >
                    ✗
                  </button>
                </td>
              </tr>
              <tr
                v-for="command in sessionApprovedCommands"
                :key="'session-' + command"
              >
                <td class="font-mono text-sm">{{ command }}</td>
                <td>
                  <span class="badge badge-info badge-sm">Session</span>
                </td>
                <td>
                  <span class="text-xs text-gray-500"
                    >Auto-removed on restart</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="
            approvedCommands.length === 0 &&
            sessionApprovedCommands.length === 0
          "
          class="text-center py-4 text-gray-400"
        >
          No approved commands. Commands will require approval before
          execution.
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  approvedCommands: string[]
  sessionApprovedCommands: string[]
}>()

defineEmits<{
  'remove-command': [command: string]
}>()
</script>