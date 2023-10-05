import { StartTranscriptionJobCommand, GetTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const multer = require('multer');

console.log("Starting up...")

const app = express();
app.use(cors());
app.use(express.json());
const storage = multer.memoryStorage(); // This will store the file in memory; you can also save it to disk or other locations
const upload = multer({ storage: storage });

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
                    console.log("keywordTimestamp: ", keywordTimestamp);
                    console.log("fullTranscript: ", fullTranscript);

                    transcriptTimestampMap = keywordTimestamp;
                    resolve();
                }
                else {
                    console.log("There is no result returned from S3");
                }

            } else if (status === "FAILED") {
                console.log('Transcription Failed: ' + data.TranscriptionJob?.FailureReason);
            } else {
                console.log("In Progress...");
                setTimeout(() => {
                    getTranscriptionDetails(params).then(resolve).catch(reject);
                }, 1000);
                ;
            }
        } catch (err) {
            console.log("Error", err);
        }
    })

};

app.post('/transcribe', upload.single('file'), async (req: any, res: any) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded' });
    }

    const params = {
        TranscriptionJobName: req.body.jobName,
        LanguageCode: "en-US",
        MediaFormat: "mp3",
        Media: {
            MediaFileUri: `s3://decipher-audio-files/${req.file.originalname}`,
        },
        OutputBucketName: s3BucketName
    };

    // pushing content to S3
    const command = new PutObjectCommand({
        Bucket: s3BucketName,
        Key: req.file.originalname,
        Body: req.file.buffer,
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
            const fullDataResponse = {fullTranscript, transcriptTimestampMap};
            res.send(fullDataResponse);
        } catch (err) {
            console.log("Error (made by chris):", err);
        }
    }, 2500);
});

app.post('/saveMP3', async (req: any, res: any) => {
    const options = {
        method: 'GET',
        url: 'https://youtube-mp36.p.rapidapi.com/dl',
        params: { id: req.body.inputUrlRef },
        headers: {
            'X-RapidAPI-Key': 'e7d95e6d25mshc0f099fc7eef2cfp1dfc20jsn04a7d40df4fa',
            'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
        }
    };
    const response = await axios(options);
    console.log("axios response to convert to mp3: ", response.data);
    const url = response.data.link;

    // axios.get(url, { responseType: 'arraybuffer' })
    //     .then(response => {
    //         const base64MP3 = Buffer.from(response.data, 'binary').toString('base64');
    //         const dataUrl = `data:audio/mpeg;base64,${base64MP3}`;
    //         console.log('response.data: ', response.data);
    //         res.send({
    //             dataUrl,
    //             title: 'hello'
    //         });
    //     })
    //     .catch(err => {
    //         res.status(500).send(`Error fetching MP3: ${err.message}`);
    //     });
});

app.listen(3001, () => {
    console.log('Server is running on port 3001...');
});
