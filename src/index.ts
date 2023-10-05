import { StartTranscriptionJobCommand, GetTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { clearDirectory } from './utils';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
require('dotenv').config();

console.log("Starting up...")

const app = express();
app.use(cors());
app.use(express.json());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const downloadsFolder = './downloads';
clearDirectory(downloadsFolder)

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
const transcribeClient = new TranscribeClient(awsCreds);
const s3Client = new S3Client(awsCreds);
let transcriptTimestampMap: any[] = [];
let fullTranscript: any[] = [];

const convertYoutubeUrlToMp3 = async (inputUrlRef: string) => {
    clearDirectory(downloadsFolder)

    const options = {
        method: 'GET',
        url: 'https://youtube-mp36.p.rapidapi.com/dl',
        params: { id: inputUrlRef },
        headers: rapidApiCreds
    };
    const response = await axios(options);
    const mp3Url = response.data.link;
    if (response.data.link) {
        if (!fs.existsSync(downloadsFolder)) {
            fs.mkdirSync(downloadsFolder, { recursive: true });
        }

        const fileName = path.basename(new URL(mp3Url).pathname);
        const savePath = path.join(downloadsFolder, fileName);

        try {
            const response = await axios.get(mp3Url, { responseType: 'stream' });

            const writer = fs.createWriteStream(savePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(fs.readFileSync(`./downloads/${fileName}`)));
                writer.on('error', reject);
            });
        } catch (err) {
            console.log("err: ", err);
        }
    }
}

const getTranscriptionDetails = async (params: any): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        const command = new GetObjectCommand({
            Bucket: s3BucketName,
            Key: `${params.TranscriptionJobName}.json`
        });

        try {
            const data = await transcribeClient.send(new GetTranscriptionJobCommand(params));
            const status = data.TranscriptionJob?.TranscriptionJobStatus;
            if (status === "COMPLETED") {
                console.log("Completed!");
                const response = await s3Client.send(command);
                const result = await response.Body?.transformToString();
                if (result) {
                    const jsonOutput = await JSON.parse(result);

                    fullTranscript = jsonOutput.results.transcripts[0].transcript;
                    let keywordTimestamp: any = [];
                    jsonOutput.results.items.forEach((item: any) => {
                        keywordTimestamp.push({ 'keyword': item.alternatives[0].content, 'timestamp': item.start_time })
                    })

                    transcriptTimestampMap = keywordTimestamp;
                    resolve();
                }
                else {
                    console.log("There is no result returned from S3");
                }

            } else if (status === "FAILED") {
                console.log('Transcription Failed: ' + data.TranscriptionJob?.FailureReason);
                reject(data.TranscriptionJob?.FailureReason);
            } else {
                console.log("In Progress...");
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 1000);
            }
        } catch (err) {
            console.log("Error", err);
        }
    })
};

app.post('/transcribe', upload.single('file'), async (req: any, res: any) => {
    if (!req.file && !req.body.inputUrlRef) {
        return res.status(400).send({ message: 'No valid data sent to server' });
    }

    let mp3Buffer = req.file?.buffer;
    let s3key = req.file?.originalname || `${req.body.inputUrlRef}.mp3`;

    if (req.body.inputUrlRef.length > 1) {
        try {
            mp3Buffer = await convertYoutubeUrlToMp3(req.body.inputUrlRef);
        }
        catch(err) {
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

    const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: s3key,
        Body: mp3Buffer,
    });

    try {
        await s3Client.send(command);
    } catch (err) {
        console.error("error when uploading to S3: ", err);
    }

    setTimeout(async () => {
        console.log("Receiving content from S3, uploading to Transcribe")
        try {
            await transcribeClient.send(
                new StartTranscriptionJobCommand(params)
            );
            await getTranscriptionDetails(params);
            const fullDataResponse = { fullTranscript, transcriptTimestampMap };
            res.send(fullDataResponse);
        } catch (err) {
            console.log("Error at final stage:", err);
        }
    }, 2500);
});

app.listen(3001, () => {
    console.log('Server is running on port 3001...');
});
