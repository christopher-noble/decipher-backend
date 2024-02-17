import { StartTranscriptionJobCommand, GetTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { KeywordTimestamp, TranscriptionParams, TranscriptionResult } from './interfaces/interfaces';
import { clearDirectory } from './utils/helpers';
import { awsCreds, rapidApiCreds } from './config/apiKeys';
import { FIVE_MINUTES, AUDIO_TOO_LARGE, S3_BUCKET_NAME, DOWNLOADS_FOLDER, ERROR_MESSAGES, SERVER_RUNNING, SERVER_STARTING_UP, S3_BUCKET_URL, PORT, TRANSCRIBE_UPLOAD, IN_PROGRESS } from "./utils/constants";
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
const serverless = require('serverless-http');
require('dotenv').config();
const logger = require('./utils/logging');

logger.info(SERVER_STARTING_UP);

const app = express();
app.use(cors());
app.use(express.json());
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: {
        fileSize: FIVE_MINUTES  // 5MB (5 mins) limit
    }
});

clearDirectory(DOWNLOADS_FOLDER) // make sure the downloads folder is empty

const transcribeClient = new TranscribeClient(awsCreds); //initialize AWS SDK with our creds
const s3Client = new S3Client(awsCreds);
let transcriptTimestampMap: KeywordTimestamp[] = [];
let fullTranscript: string[] = [];

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
const convertYoutubeUrlToMp3 = async (inputUrlRef: string) => {
    clearDirectory(DOWNLOADS_FOLDER) // make sure the downloads folder is empty.

    const options = {
        method: 'GET',
        url: rapidApiCreds.apiUrl,
        params: { id: inputUrlRef },
        headers: rapidApiCreds.headers
    };

    try {
        const response = await axios.request(options); //GET request to Youtube to mp3
        console.log(response.data);
        const mp3Url = response.data.link;

        if (response.data.link) {
            if (!fs.existsSync(DOWNLOADS_FOLDER)) {
                fs.mkdirSync(DOWNLOADS_FOLDER, { recursive: true });
            }

            const fileName = path.basename(new URL(mp3Url).pathname);
            const savePath = path.join(DOWNLOADS_FOLDER, fileName);

            try {
                const writer = fs.createWriteStream(savePath);//save the downloaded MP3 file in downloads folder
                await axios.get(mp3Url, { responseType: 'stream' }) //download the MP3 file in chunks
                    .then(response => response.data.pipe(writer))
                    .catch((err) => logger.error(ERROR_MESSAGES.NO_DATA_FOUND, err));

                //finally the MP3 file is read from the downloads directory, and function returns the file content in buffer format
                return new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve(fs.readFileSync(`./downloads/${fileName}`))); //convert the MP3 file into a buffer
                    writer.on('error', reject);
                });
            } catch (err) {
                logger.error(ERROR_MESSAGES.NO_DATA_FOUND, err);
            }
        }

    } catch (error) {
        console.error(error);
    }
}

const getTranscriptionDetails = async (params: TranscriptionParams): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `${params.TranscriptionJobName}.json`
        });

        try {
            const data = await transcribeClient.send(new GetTranscriptionJobCommand(params));
            const status = data.TranscriptionJob?.TranscriptionJobStatus;
            if (status === "COMPLETED") {
                logger.info('Completed!');
                const response = await s3Client.send(command);
                const result = await response.Body?.transformToString();
                if (result) {
                    const jsonOutput = await JSON.parse(result);

                    fullTranscript = jsonOutput.results.transcripts[0].transcript;
                    let keywordTimestamp: KeywordTimestamp[] = []; //keywordTimestamp is a array of objects that I made to link together words and timestamps of each word as key value pairs.
                    jsonOutput.results.items.forEach((item: TranscriptionResult) => {
                        keywordTimestamp.push({ 'keyword': item.alternatives[0].content, 'timestamp': item.start_time })
                    })

                    transcriptTimestampMap = keywordTimestamp;
                    resolve();
                }
                else {
                    logger.info(ERROR_MESSAGES.NO_DATA_FOUND);
                }

            } else if (status === "FAILED") {
                logger.info(ERROR_MESSAGES.TRANSCRIPTION_FAILED + data.TranscriptionJob?.FailureReason);
                reject(data.TranscriptionJob?.FailureReason);
            } else {
                logger.info(IN_PROGRESS);
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 2000);
            }
        } catch (err) {
            logger.error(ERROR_MESSAGES.TRANSCRIPTION_ERROR, err);
        }
    })
};

/**
 * API endpoint.
 * req is the request parameter send by the frontend. res is the reponse returned to the frontend.
 */
app.post('/transcribe', upload.single('file'), async (req: any, res: any) => {
    if (!req.file && !req.body.inputUrlRef) {
        return res.status(400).send({ message: ERROR_MESSAGES.NO_DATA_FOUND });
    }
    if (req.file && req.file.size > FIVE_MINUTES) {
        logger.error(ERROR_MESSAGES.FILE_TOO_LARGE);
        return res.status(400).send({ message: AUDIO_TOO_LARGE });
    }

    let mp3Buffer = req.file?.buffer;
    let s3key = req.file?.originalname || `${req.body.inputUrlRef}.mp3`;

    if (req.body.inputUrlRef?.length > 1) {
        try {
            mp3Buffer = await convertYoutubeUrlToMp3(req.body.inputUrlRef);
        }
        catch (err) {
            logger.error(ERROR_MESSAGES.INVALID_YOUTUBE_URL, err);
        }
    }

    if (mp3Buffer && mp3Buffer.length > FIVE_MINUTES) {
        logger.error(ERROR_MESSAGES.FILE_TOO_LARGE);
        return res.status(400).send({ message: AUDIO_TOO_LARGE });
    }

    const params = {
        TranscriptionJobName: req.body.jobName,
        LanguageCode: "en-US",
        MediaFormat: "mp3",
        Media: {
            MediaFileUri: S3_BUCKET_URL + s3key,
        },
        OutputBucketName: S3_BUCKET_NAME
    };

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3key,
        Body: mp3Buffer,
    });

    try {
        await s3Client.send(command);
    } catch (err) {
        logger.error(ERROR_MESSAGES.S3_UPLOAD_ERROR, err);
    }

    setTimeout(async () => {
        logger.info(TRANSCRIBE_UPLOAD);
        try {
            await transcribeClient.send(new StartTranscriptionJobCommand(params));
            await getTranscriptionDetails(params);
            const fullDataResponse = { fullTranscript, transcriptTimestampMap };
            if (fullTranscript || transcriptTimestampMap) {
                res.send(fullDataResponse);
            }
            else {
                res.send(ERROR_MESSAGES.TRANSCRIPTION_ERROR);
            }
        } catch (err) {
            logger.error(ERROR_MESSAGES.FINAL_STAGE_ERROR, err);
        }
    }, 2500);
});

app.listen(PORT, '0.0.0.0', () => {
    logger.info(SERVER_RUNNING);
});

module.exports.handler = serverless(app);
