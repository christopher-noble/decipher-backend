"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_transcribe_1 = require("@aws-sdk/client-transcribe");
const client_s3_1 = require("@aws-sdk/client-s3");
const utils_1 = require("./utils/utils");
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const serverless = require('serverless-http');
require('dotenv').config();
const logger = require('./utils/logging');
logger.info('Starting up...');
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const storage = multer_1.default.memoryStorage();
const FIVE_MINUTES = 5 * 1024 * 1024;
const upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: FIVE_MINUTES // 5MB (5 mins) limit
    }
});
const downloadsFolder = './downloads';
(0, utils_1.clearDirectory)(downloadsFolder); // make sure the downloads folder is empty
const AUDIO_TOO_LARGE = 'Audio must be under 5 minutes (beta)';
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
const transcribeClient = new client_transcribe_1.TranscribeClient(awsCreds); //initialize AWS SDK with our creds
const s3Client = new client_s3_1.S3Client(awsCreds);
let transcriptTimestampMap = [];
let fullTranscript = [];
/**
 *
 * @param inputUrlRef
 * @returns mp3 file in buffer format
 *
 * This function sends a GET request to https://youtube-mp36.p.rapidapi.com/dl with the inputUrlRef as a parameter.
 * inputUrlRef is "EeEf6ydtI" from this example link: https://www.youtube.com/watch?v=J_EeEf6ydtI.
 * The GET request from https://youtube-mp36.p.rapidapi.com/dl returns a response containing a downloadable link for the new audio file.
 * The new audio file is temporarily stored in /downloads before being converted and returned in buffer format.
 */
const convertYoutubeUrlToMp3 = async (inputUrlRef) => {
    (0, utils_1.clearDirectory)(downloadsFolder); // make sure the downloads folder is empty.
    const options = {
        method: 'GET',
        url: 'https://youtube-mp36.p.rapidapi.com/dl',
        params: { id: inputUrlRef },
        headers: rapidApiCreds
    };
    logger.info('inputUrlRef: ', inputUrlRef);
    const response = await (0, axios_1.default)(options); //GET request
    const mp3Url = response.data.link;
    logger.info('response.data.link: ', response.data.link);
    if (response.data.link) {
        if (!fs_1.default.existsSync(downloadsFolder)) {
            fs_1.default.mkdirSync(downloadsFolder, { recursive: true });
        }
        const fileName = path_1.default.basename(new URL(mp3Url).pathname);
        const savePath = path_1.default.join(downloadsFolder, fileName);
        try {
            const response = await axios_1.default.get(mp3Url, { responseType: 'stream' }); //download the MP3 file in chunks
            const writer = fs_1.default.createWriteStream(savePath); //save the downloaded MP3 file in downloads folder
            response.data.pipe(writer);
            //finally the MP3 file is read from the downloads directory, and function returns the file content in buffer format
            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(fs_1.default.readFileSync(`./downloads/${fileName}`))); //convert the MP3 file into a buffer
                writer.on('error', reject);
            });
        }
        catch (err) {
            logger.error('Error on writing/converting mp3');
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
                logger.info('Completed!');
                const response = await s3Client.send(command);
                const result = await ((_b = response.Body) === null || _b === void 0 ? void 0 : _b.transformToString());
                if (result) {
                    const jsonOutput = await JSON.parse(result);
                    fullTranscript = jsonOutput.results.transcripts[0].transcript;
                    let keywordTimestamp = []; //keywordTimestamp is a array of objects that I made to link together words and timestamps of each word as key value pairs.
                    jsonOutput.results.items.forEach((item) => {
                        keywordTimestamp.push({ 'keyword': item.alternatives[0].content, 'timestamp': item.start_time });
                    });
                    transcriptTimestampMap = keywordTimestamp;
                    resolve();
                }
                else {
                    logger.info('There is no result returned from S3');
                }
            }
            else if (status === "FAILED") {
                logger.info('Transcription Failed: ' + ((_c = data.TranscriptionJob) === null || _c === void 0 ? void 0 : _c.FailureReason));
                reject((_d = data.TranscriptionJob) === null || _d === void 0 ? void 0 : _d.FailureReason);
            }
            else {
                logger.info('In Progress...');
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 2000);
            }
        }
        catch (err) {
            logger.error('Error on transcription process');
        }
    });
};
/**
 * API endpoint.
 * req is the request parameter send by the frontend. res is the reponse returned to the frontend.
 */
app.post('/transcribe', upload.single('file'), async (req, res) => {
    var _a, _b, _c;
    logger.info('req.body.inputUrlRef: ', req.body.inputUrlRef);
    if (!req.file && !req.body.inputUrlRef) {
        return res.status(400).send({ message: 'No data provided' });
    }
    if (req.file && req.file.size > FIVE_MINUTES) {
        logger.error('File is too large');
        return res.status(400).send({ message: AUDIO_TOO_LARGE });
    }
    let mp3Buffer = (_a = req.file) === null || _a === void 0 ? void 0 : _a.buffer;
    let s3key = ((_b = req.file) === null || _b === void 0 ? void 0 : _b.originalname) || `${req.body.inputUrlRef}.mp3`;
    if (((_c = req.body.inputUrlRef) === null || _c === void 0 ? void 0 : _c.length) > 1) {
        try {
            mp3Buffer = await convertYoutubeUrlToMp3(req.body.inputUrlRef);
        }
        catch (err) {
            logger.error('Error with inputUrlRef: ');
        }
    }
    else {
        logger.error('inputUrlRef is invalid: ', req.body.inputUrlRef);
    }
    if (mp3Buffer && mp3Buffer.length > FIVE_MINUTES) {
        logger.error('File is too large');
        return res.status(400).send({ message: AUDIO_TOO_LARGE });
    }
    logger.info('req.body.jobName: ', req.body.jobName);
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
        logger.error("Error when uploading to S3: ");
    }
    setTimeout(async () => {
        logger.info("Receiving content from S3, uploading to Transcribe");
        try {
            await transcribeClient.send(new client_transcribe_1.StartTranscriptionJobCommand(params));
            await getTranscriptionDetails(params);
            const fullDataResponse = { fullTranscript, transcriptTimestampMap };
            res.send(fullDataResponse);
        }
        catch (err) {
            logger.error("Error at final stage: ", err);
        }
    }, 2500);
});
app.listen(3000, '0.0.0.0', () => {
    logger.info('Server is running');
});
module.exports.handler = serverless(app);
