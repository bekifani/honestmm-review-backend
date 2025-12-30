import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';

const token = process.env.TELEGRAM_BOT_TOKEN; // from @BotFather
const bot = new TelegramBot(token as string, { polling: false });

const uploadsDir = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
async function ensureUploadsDir() {
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
}

// Download Telegram file and upload to server
export async function downloadTelegramFileAndUpload(fileId: string, req: any = null): Promise<string> {
  try {
    // Get file info from Telegram
    const file = await bot.getFile(fileId);

    if (!file.file_path) {
      throw new Error('File path not available from Telegram');
    }

    // Download file from Telegram
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

    // Generate filename
    const fileExtension = path.extname(file.file_path) || '.jpg';
    const filename = `${Date.now()}_telegram_payment_proof${fileExtension}`;

    // Save file to uploads directory
    await ensureUploadsDir();
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, response.data);

    // Return full URL - use environment variable or request info
    let baseUrl: string;
    if (req) {
      const protocol = req.protocol;
      const host = req.get('host');
      baseUrl = `${protocol}://${host}`;
    } else {
      // Fallback to environment variable or default
      baseUrl = process.env.CLIENT_URL || 'http://app.globexcard.com';
    }

    return `${baseUrl}/api/uploads/${filename}`;
  } catch (error) {
    throw error;
  }
}

// function to send a message
export async function sendMessage(userId: string, text: string) {
  try {
    await bot.sendMessage(userId, text);
  } catch (err: any) {
  }
}

// function to send a message with inline buttons
export async function sendMessageWithButtons(
  userId: string,
  text: string,
  buttons: { text: string; callback_data: string }[][]
) {
  try {
    await bot.sendMessage(userId, text, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  } catch (err: any) {
  }
}

// function to edit a message with new buttons
export async function editMessageWithButtons(
  userId: string,
  messageId: number,
  text: string,
  buttons: { text: string; callback_data: string }[][]
) {
  try {
    await bot.editMessageText(text, {
      chat_id: userId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  } catch (err: any) {
  }
}

// function to edit a message text only
export async function editMessageText(
  userId: string,
  messageId: number,
  text: string
) {
  try {
    await bot.editMessageText(text, {
      chat_id: userId,
      message_id: messageId
    });
  } catch (err: any) {
  }
}

// function to edit a photo caption with buttons
export async function editMessageCaptionWithButtons(
  userId: string,
  messageId: number,
  caption: string,
  buttons: { text: string; callback_data: string }[][]
) {
  try {
    await bot.editMessageCaption(caption, {
      chat_id: userId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  } catch (err: any) {
  }
}

// function to answer callback query
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
) {
  try {
    await bot.answerCallbackQuery(callbackQueryId, {
      text: text,
      show_alert: showAlert
    });
  } catch (err: any) {
  }
}

// Export the bot instance for direct use if needed
export { bot };

