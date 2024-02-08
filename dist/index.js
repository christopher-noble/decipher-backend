"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_transcribe_1 = require("@aws-sdk/client-transcribe");
const client_s3_1 = require("@aws-sdk/client-s3");
const helpers_1 = require("./utils/helpers");
const apiKeys_1 = require("./config/apiKeys");
const constants_1 = require("./utils/constants");
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const serverless = require('serverless-http');
require('dotenv').config();
const logger = require('./utils/logging');
logger.info(constants_1.SERVER_STARTING_UP);
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: constants_1.FIVE_MINUTES // 5MB (5 mins) limit
    }
});
(0, helpers_1.clearDirectory)(constants_1.DOWNLOADS_FOLDER); // make sure the downloads folder is empty
const transcribeClient = new client_transcribe_1.TranscribeClient(apiKeys_1.awsCreds); //initialize AWS SDK with our creds
const s3Client = new client_s3_1.S3Client(apiKeys_1.awsCreds);
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
    (0, helpers_1.clearDirectory)(constants_1.DOWNLOADS_FOLDER); // make sure the downloads folder is empty.
    console.log("inputUrlRef IN CONVERT YOUTUBE: ", inputUrlRef);
    const options = {
        method: 'GET',
        url: apiKeys_1.rapidApiCreds.apiUrl,
        params: { id: inputUrlRef },
        headers: apiKeys_1.rapidApiCreds.headers
    };
    console.log("options: ", options);
    logger.info('inputUrlRef: ', inputUrlRef);
    try {
        const response = await axios_1.default.request(options); //GET request to Youtube to mp3
        console.log(response.data);
        const mp3Url = response.data.link;
        if (response.data.link) {
            if (!fs_1.default.existsSync(constants_1.DOWNLOADS_FOLDER)) {
                fs_1.default.mkdirSync(constants_1.DOWNLOADS_FOLDER, { recursive: true });
            }
            const fileName = path_1.default.basename(new URL(mp3Url).pathname);
            const savePath = path_1.default.join(constants_1.DOWNLOADS_FOLDER, fileName);
            try {
                logger.info("mp3Url: ", mp3Url);
                const writer = fs_1.default.createWriteStream(savePath); //save the downloaded MP3 file in downloads folder
                await axios_1.default.get(mp3Url, { responseType: 'stream' }) //download the MP3 file in chunks
                    .then(response => response.data.pipe(writer))
                    .catch((err) => logger.error("error getting mp3 audio:", err));
                //finally the MP3 file is read from the downloads directory, and function returns the file content in buffer format
                return new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve(fs_1.default.readFileSync(`./downloads/${fileName}`))); //convert the MP3 file into a buffer
                    writer.on('error', reject);
                });
            }
            catch (err) {
                logger.error('Error on writing/converting mp3', err);
            }
        }
    }
    catch (error) {
        console.error(error);
    }
};
const getTranscriptionDetails = async (params) => {
    return new Promise(async (resolve, reject) => {
        var _a, _b, _c, _d;
        const command = new client_s3_1.GetObjectCommand({
            Bucket: constants_1.S3_BUCKET_NAME,
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
                logger.info(constants_1.ERROR_MESSAGES.TRANSCRIPTION_FAILED + ((_c = data.TranscriptionJob) === null || _c === void 0 ? void 0 : _c.FailureReason));
                reject((_d = data.TranscriptionJob) === null || _d === void 0 ? void 0 : _d.FailureReason);
            }
            else {
                logger.info(constants_1.IN_PROGRESS);
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 2000);
            }
        }
        catch (err) {
            logger.error(constants_1.ERROR_MESSAGES.TRANSCRIPTION_ERROR, err);
        }
    });
};
/**
 * API endpoint.
 * req is the request parameter send by the frontend. res is the reponse returned to the frontend.
 */
app.post('/transcribe', upload.single('file'), async (req, res) => {
    var _a, _b, _c;
    logger.info("req.body.inputUrlRef: ", req.body.inputUrlRef);
    if (!req.file && !req.body.inputUrlRef) {
        return res.status(400).send({ message: constants_1.ERROR_MESSAGES.NO_DATA_FOUND });
    }
    if (req.file && req.file.size > constants_1.FIVE_MINUTES) {
        logger.error(constants_1.ERROR_MESSAGES.FILE_TOO_LARGE);
        return res.status(400).send({ message: constants_1.AUDIO_TOO_LARGE });
    }
    let mp3Buffer = (_a = req.file) === null || _a === void 0 ? void 0 : _a.buffer;
    let s3key = ((_b = req.file) === null || _b === void 0 ? void 0 : _b.originalname) || `${req.body.inputUrlRef}.mp3`;
    if (((_c = req.body.inputUrlRef) === null || _c === void 0 ? void 0 : _c.length) > 1) {
        console.log("req.body.inputUrlRef: ", req.body.inputUrlRef);
        try {
            mp3Buffer = await convertYoutubeUrlToMp3(req.body.inputUrlRef);
        }
        catch (err) {
            logger.error(constants_1.ERROR_MESSAGES.INVALID_YOUTUBE_URL, err);
        }
    }
    if (mp3Buffer && mp3Buffer.length > constants_1.FIVE_MINUTES) {
        logger.error(constants_1.ERROR_MESSAGES.FILE_TOO_LARGE);
        return res.status(400).send({ message: constants_1.AUDIO_TOO_LARGE });
    }
    logger.info('req.body.jobName: ', req.body.jobName);
    const params = {
        TranscriptionJobName: req.body.jobName,
        LanguageCode: "en-US",
        MediaFormat: "mp3",
        Media: {
            MediaFileUri: constants_1.S3_BUCKET_URL + s3key,
        },
        OutputBucketName: constants_1.S3_BUCKET_NAME
    };
    const command = new client_s3_1.PutObjectCommand({
        Bucket: constants_1.S3_BUCKET_NAME,
        Key: s3key,
        Body: mp3Buffer,
    });
    try {
        await s3Client.send(command);
    }
    catch (err) {
        logger.error(constants_1.ERROR_MESSAGES.S3_UPLOAD_ERROR, err);
    }
    setTimeout(async () => {
        logger.info(constants_1.TRANSCRIBE_UPLOAD);
        try {
            await transcribeClient.send(new client_transcribe_1.StartTranscriptionJobCommand(params));
            await getTranscriptionDetails(params);
            const fullDataResponse = { fullTranscript, transcriptTimestampMap };
            if (fullTranscript || transcriptTimestampMap) {
                res.send(fullDataResponse);
            }
            else {
                res.send(constants_1.ERROR_MESSAGES.TRANSCRIPTION_ERROR);
            }
        }
        catch (err) {
            logger.error(constants_1.ERROR_MESSAGES.FINAL_STAGE_ERROR, err);
        }
    }, 2500);
});
app.listen(constants_1.PORT, '0.0.0.0', () => {
    logger.info(constants_1.SERVER_RUNNING);
});
module.exports.handler = serverless(app);
