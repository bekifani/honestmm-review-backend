import express from "express";
import multer from "multer";
import path from "path";
import { requireAuth } from "../middleware/auth";
import { transcribeVoice, textToSpeech } from "../controllers/voiceController";

const router = express.Router();

// Configure disk storage for voice recordings
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, `voice-${Date.now()}${path.extname(file.originalname)}`);
    },
});

const upload = multer({ storage });

router.use(requireAuth);

// Endpoint: POST /api/voice/transcribe
router.post("/transcribe", upload.single("audio"), transcribeVoice);

// Endpoint: POST /api/voice/speak
router.post("/speak", textToSpeech);

export default router;
