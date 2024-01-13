import { StartTranscriptionJobCommand, GetTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { KeywordTimestamp, TranscriptionParams, TranscriptionResult } from './utils/interfaces';
import { clearDirectory } from './utils/utils';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
const serverless = require('serverless-http');
require('dotenv').config();
const logger = require('./utils/logging');

logger.info('Starting up...');

const app = express();
app.use(cors());
app.use(express.json());
const storage = multer.memoryStorage();

const FIVE_MINUTES = 5 * 1024 * 1024;

const upload = multer({
    storage: storage,
    limits: {
        fileSize: FIVE_MINUTES  // 5MB (5 mins) limit
    }
});
const downloadsFolder = './downloads';
clearDirectory(downloadsFolder) // make sure the downloads folder is empty
const AUDIO_TOO_LARGE = 'Audio must be under 5 minutes (beta)';

const rapidApiCreds = {
    'X-RapidAPI-Key': process.env.X_RAPID_API_KEY,
    'X-RapidAPI-Host': process.env.X_RAPID_API_HOST
};

const awsCreds = {
    region: 'us-west-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
}

const s3BucketName = 'decipher-audio-files';
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
    clearDirectory(downloadsFolder) // make sure the downloads folder is empty.

    const options = {
        method: 'GET',
        url: 'https://youtube-mp36.p.rapidapi.com/dl',
        params: { id: inputUrlRef },
        headers: rapidApiCreds
    };

    logger.info('options: ', options);

    const response = await axios(options); //GET request
    const mp3Url = response.data.link;

    if (response.data.link) {
        if (!fs.existsSync(downloadsFolder)) {
            fs.mkdirSync(downloadsFolder, { recursive: true });
        }

        const fileName = path.basename(new URL(mp3Url).pathname);
        const savePath = path.join(downloadsFolder, fileName);

        try {
            const response = await axios.get(mp3Url, { responseType: 'stream' });//download the MP3 file in chunks

            const writer = fs.createWriteStream(savePath);//save the downloaded MP3 file in downloads folder
            response.data.pipe(writer);

            //finally the MP3 file is read from the downloads directory, and function returns the file content in buffer format
            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(fs.readFileSync(`./downloads/${fileName}`))); //convert the MP3 file into a buffer
                writer.on('error', reject);
            });
        } catch (err) {
            logger.error(err);
        }
    }
}

const getTranscriptionDetails = async (params: TranscriptionParams): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        const command = new GetObjectCommand({
            Bucket: s3BucketName,
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
                    logger.info('There is no result returned from S3');
                }

            } else if (status === "FAILED") {
                logger.info('Transcription Failed: ' + data.TranscriptionJob?.FailureReason);
                reject(data.TranscriptionJob?.FailureReason);
            } else {
                logger.info('In Progress...');
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 2000);
            }
        } catch (err) {
            logger.error(err);
        }
    })
};

/**
 * API endpoint.
 * req is the request parameter send by the frontend. res is the reponse returned to the frontend.
 */
app.post('/transcribe', upload.single('file'), async (req: any, res: any) => {
    if (!req.file && !req.body.inputUrlRef) {
        return res.status(400).send({ message: 'No data provided' });
    }
    if (req.file && req.file.size > FIVE_MINUTES) {
        logger.error('File is too large');
        return res.status(400).send({ message: AUDIO_TOO_LARGE });
    }

    let mp3Buffer = req.file?.buffer;
    let s3key = req.file?.originalname || `${req.body.inputUrlRef}.mp3`;

    if (req.body.inputUrlRef?.length > 1) {
        try {
            mp3Buffer = await convertYoutubeUrlToMp3(req.body.inputUrlRef);
        }
        catch (err) {
            logger.error(err);
        }
    }

    if (mp3Buffer && mp3Buffer.length > FIVE_MINUTES) {
        logger.error('File is too large');
        return res.status(400).send({ message: AUDIO_TOO_LARGE });
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

    const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3key,
        Body: mp3Buffer,
    });

    try {
        await s3Client.send(command);
    } catch (err) {
        logger.error("Error when uploading to S3: ", err);
        console.error("error when uploading to S3: ", err);
    }

    setTimeout(async () => {
        logger.info("Receiving content from S3, uploading to Transcribe")
        try {
            await transcribeClient.send(
                new StartTranscriptionJobCommand(params)
            );
            await getTranscriptionDetails(params);
            const fullDataResponse = { fullTranscript, transcriptTimestampMap };
            res.send(fullDataResponse);
        } catch (err) {
            logger.error("Error at final stage: ", err);
        }
    }, 2500);
});

app.listen(3000, '0.0.0.0', () => {
    logger.info('Server is running');
});

module.exports.handler = serverless(app);
