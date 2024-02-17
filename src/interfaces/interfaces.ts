import express from "express";

export interface KeywordTimestamp {
    keyword: string;
    timestamp: string;
}

export interface TranscriptionParams {
    TranscriptionJobName: string;
    LanguageCode: string;
    MediaFormat: string;
    Media: {
        MediaFileUri: string;
    };
    OutputBucketName: string;
}

export interface TranscriptionResult {
    start_time: string;
    content: string;
    alternatives: {
        content: string;
        start_time: string;
    }[];
}

export interface ExpressRequestWithFile extends express.Request {
    file: Express.Multer.File;
}

export interface ExpressRequestWithBody extends express.Request {
    body: {
        inputUrlRef: string;
        jobName: string;
    };
}