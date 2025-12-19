import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { Request } from "express";

const uploadsDir = path.join(process.cwd(), "uploads");

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Check for folder existence
 */
async function fileExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensures the uploads directory exists
 */
async function ensureUploadsDir() {
    if (!(await fileExists(uploadsDir))) {
        await fs.mkdir(uploadsDir);
    }
}

/**
 * Saves the uploaded file buffer to disk and returns its full URL
 * @param req Express request
 * @param file Multer file object
 * @returns Full URL to the uploaded file
 */
export async function uploader(req: Request, file: Express.Multer.File): Promise<string> {
    await ensureUploadsDir();
    const filename = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, file.buffer);
    const protocol = req.protocol;
    const host = req.get("host");
    return `${protocol}://${host}/api/uploads/${filename}`;
}

export default upload;
