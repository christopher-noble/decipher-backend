"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_MESSAGES = exports.IN_PROGRESS = exports.TRANSCRIBE_UPLOAD = exports.SERVER_RUNNING = exports.SERVER_STARTING_UP = exports.AWS_REGION = exports.PORT = exports.DOWNLOADS_FOLDER = exports.S3_BUCKET_URL = exports.S3_BUCKET_NAME = exports.AUDIO_TOO_LARGE = exports.FIVE_MINUTES = void 0;
exports.FIVE_MINUTES = 5 * 1024 * 1024;
exports.AUDIO_TOO_LARGE = 'Audio must be under 5 minutes (beta)';
exports.S3_BUCKET_NAME = 'decipher-audio-files';
exports.S3_BUCKET_URL = 's3://decipher-audio-files/';
exports.DOWNLOADS_FOLDER = './downloads';
exports.PORT = 3000;
exports.AWS_REGION = 'us-west-2';
exports.SERVER_STARTING_UP = `Server is starting up...`;
exports.SERVER_RUNNING = `Server is running on port ${exports.PORT}...`;
exports.TRANSCRIBE_UPLOAD = 'Receiving content from S3, uploading to Transcribe';
exports.IN_PROGRESS = 'In Progress...';
exports.ERROR_MESSAGES = {
    TRANSCRIPTION_ERROR: 'Unable to process transcript: ',
    TRANSCRIPTION_FAILED: 'Transcription failed: ',
    S3_UPLOAD_ERROR: 'Error when uploading to S3: ',
    INVALID_YOUTUBE_URL: 'Error with inputUrlRef: ',
    FILE_TOO_LARGE: 'File is too large',
    FINAL_STAGE_ERROR: 'Error at final stage: ',
    USER_NOT_FOUND: 'User not found',
    NO_DATA_FOUND: 'No data found',
    INVALID_PASSWORD: 'Invalid password',
    PERMISSION_DENIED: 'Permission denied',
};
