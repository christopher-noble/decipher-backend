"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_transcribe_1 = require("@aws-sdk/client-transcribe");
const client_s3_1 = require("@aws-sdk/client-s3");
const utils_1 = require("./utils");
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const serverless = require('serverless-http');
require('dotenv').config();
console.log("Starting up...");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({ storage: storage });
const downloadsFolder = './downloads';
(0, utils_1.clearDirectory)(downloadsFolder);
const rapidApiCreds = {
    'X-RapidAPI-Key': process.env.X_RAPID_API_KEY,
    'X-RapidAPI-Host': process.env.X_RAPID_API_HOST
};
const awsCreds = {
    region: 'us-west-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
};
const s3BucketName = 'decipher-audio-files';
const transcribeClient = new client_transcribe_1.TranscribeClient(awsCreds);
const s3Client = new client_s3_1.S3Client(awsCreds);
let transcriptTimestampMap = [];
let fullTranscript = [];
const convertYoutubeUrlToMp3 = async (inputUrlRef) => {
    (0, utils_1.clearDirectory)(downloadsFolder);
    const options = {
        method: 'GET',
        url: 'https://youtube-mp36.p.rapidapi.com/dl',
        params: { id: inputUrlRef },
        headers: rapidApiCreds
    };
    const response = await (0, axios_1.default)(options);
    const mp3Url = response.data.link;
    if (response.data.link) {
        if (!fs_1.default.existsSync(downloadsFolder)) {
            fs_1.default.mkdirSync(downloadsFolder, { recursive: true });
        }
        const fileName = path_1.default.basename(new URL(mp3Url).pathname);
        const savePath = path_1.default.join(downloadsFolder, fileName);
        try {
            const response = await axios_1.default.get(mp3Url, { responseType: 'stream' });
            const writer = fs_1.default.createWriteStream(savePath);
            response.data.pipe(writer);
            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(fs_1.default.readFileSync(`./downloads/${fileName}`)));
                writer.on('error', reject);
            });
        }
        catch (err) {
            console.log("err: ", err);
        }
    }
};
const getTranscriptionDetails = async (params) => {
    return new Promise(async (resolve, reject) => {
        var _a, _b, _c, _d;
        const command = new client_s3_1.GetObjectCommand({
            Bucket: s3BucketName,
            Key: `${params.TranscriptionJobName}.json`
        });
        try {
            const data = await transcribeClient.send(new client_transcribe_1.GetTranscriptionJobCommand(params));
            const status = (_a = data.TranscriptionJob) === null || _a === void 0 ? void 0 : _a.TranscriptionJobStatus;
            if (status === "COMPLETED") {
                console.log("Completed!");
                const response = await s3Client.send(command);
                const result = await ((_b = response.Body) === null || _b === void 0 ? void 0 : _b.transformToString());
                if (result) {
                    const jsonOutput = await JSON.parse(result);
                    fullTranscript = jsonOutput.results.transcripts[0].transcript;
                    let keywordTimestamp = [];
                    jsonOutput.results.items.forEach((item) => {
                        keywordTimestamp.push({ 'keyword': item.alternatives[0].content, 'timestamp': item.start_time });
                    });
                    transcriptTimestampMap = keywordTimestamp;
                    resolve();
                }
                else {
                    console.log("There is no result returned from S3");
                }
            }
            else if (status === "FAILED") {
                console.log('Transcription Failed: ' + ((_c = data.TranscriptionJob) === null || _c === void 0 ? void 0 : _c.FailureReason));
                reject((_d = data.TranscriptionJob) === null || _d === void 0 ? void 0 : _d.FailureReason);
            }
            else {
                console.log("In Progress...");
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 1000);
            }
        }
        catch (err) {
            console.log("Error", err);
        }
    });
};
app.post('/transcribe', upload.single('file'), async (req, res) => {
    var _a, _b, _c;
    if (!req.file && !req.body.inputUrlRef) {
        return res.status(400).send({ message: 'No valid data sent to server' });
    }
    let mp3Buffer = (_a = req.file) === null || _a === void 0 ? void 0 : _a.buffer;
    let s3key = ((_b = req.file) === null || _b === void 0 ? void 0 : _b.originalname) || `${req.body.inputUrlRef}.mp3`;
    if (((_c = req.body.inputUrlRef) === null || _c === void 0 ? void 0 : _c.length) > 1) {
        try {
            mp3Buffer = await convertYoutubeUrlToMp3(req.body.inputUrlRef);
        }
        catch (err) {
            console.log("err: ", err);
        }
    }
    const params = {
        TranscriptionJobName: req.body.jobName,
        LanguageCode: "en-US",
        MediaFormat: "mp3",
        Media: {
            MediaFileUri: `s3://decipher-audio-files/${s3key}`,
        },
        OutputBucketName: s3BucketName
    };
    const command = new client_s3_1.PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3key,
        Body: mp3Buffer,
    });
    try {
        await s3Client.send(command);
    }
    catch (err) {
        console.error("error when uploading to S3: ", err);
    }
    setTimeout(async () => {
        console.log("Receiving content from S3, uploading to Transcribe");
        try {
            await transcribeClient.send(new client_transcribe_1.StartTranscriptionJobCommand(params));
            await getTranscriptionDetails(params);
            const fullDataResponse = { fullTranscript, transcriptTimestampMap };
            res.send(fullDataResponse);
        }
        catch (err) {
            console.log("Error at final stage:", err);
        }
    }, 2500);
});
app.listen(3000, '0.0.0.0', () => {
    console.log('Server is running on port 3000...');
});
module.exports.handler = serverless(app);
