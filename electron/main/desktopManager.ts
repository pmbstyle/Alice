
import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

const ALLOWED_COMMANDS = ['ls', 'dir'];

class DesktopManager {
  constructor() {
    this.registerIpcHandlers();
  }

  private registerIpcHandlers() {
    ipcMain.handle('desktop:listDirectory', async (event, dirPath) => {
      try {
        const files = await fs.readdir(dirPath);
        return { success: true, files };
      } catch (error) {
        console.error('Error listing directory:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('desktop:executeCommand', async (event, command) => {
      const commandName = command.split(' ')[0];
      if (!ALLOWED_COMMANDS.includes(commandName)) {
        return { success: false, error: `Command not allowed: ${commandName}` };
      }

      return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing command: ${command}`, error);
            resolve({ success: false, error: error.message });
            return;
          }
          if (stderr) {
            console.error(`Command stderr: ${command}`, stderr);
            resolve({ success: false, error: stderr });
            return;
          }
          resolve({ success: true, output: stdout });
        });
      });
    });
  }
}

export default DesktopManager;
