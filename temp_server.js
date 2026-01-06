const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

// Allow all origins for subdomains compatibility
app.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure default directories exist
['deliveries', 'customers', 'general'].forEach(cat => {
    const dir = path.join(uploadsDir, cat);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const category = req.body.category || 'general';
        const dir = path.join(uploadsDir, category);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const filename = req.body.filename || `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDFs are allowed'));
        }
    }
});

app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Static file serving
app.use("/files", express.static(uploadsDir));

app.post("/upload", (req, res) => {
    upload.single("file")(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error("Multer error:", err);
            return res.status(400).json({ error: err.message });
        } else if (err) {
            console.error("Upload error:", err);
            return res.status(500).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Since we use diskStorage, the file is already in the right place
        // Verify req.body.category matches where we put it (it should if frontend sent it first)
        // If frontend sent fields after file, Multer might have used 'general' default in destination()
        // But since we fixed frontend to send fields first, it should be fine.

        // We can double check and move if necessary, but keep it simple for now.

        const category = req.body.category || 'general';  // This might be correct now
        const filename = req.file.filename;
        const fileUrl = `https://upload.aquvit.id/files/${category}/${filename}`;

        console.log("File uploaded successfully:", {
            category,
            filename,
            path: req.file.path,
            size: req.file.size
        });

        res.json({
            success: true,
            file: {
                category,
                filename,
                originalName: req.file.originalname,
                size: req.file.size,
                fileUrl
            }
        });
    });
});

app.delete("/files/:category/:filename", (req, res) => {
    const filePath = path.join(uploadsDir, req.params.category, req.params.filename);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log("File deleted:", filePath);
            res.json({ success: true, message: "File deleted" });
        } catch (e) {
            res.status(500).json({ error: "Failed to delete file" });
        }
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

app.listen(PORT, () => {
    console.log("Upload server running on port " + PORT);
});
