export const FIVE_MINUTES = 5 * 1024 * 1024;
export const AUDIO_TOO_LARGE = 'Audio must be under 5 minutes (beta)';
export const S3_BUCKET_NAME = 'decipher-audio-files';
export const S3_BUCKET_URL = 's3://decipher-audio-files/';
export const DOWNLOADS_FOLDER = './downloads';
export const PORT = 3000;
export const AWS_REGION = 'us-west-2';
export const SERVER_STARTING_UP = `Server is starting up...`;
export const SERVER_RUNNING = `Server is running on port ${PORT}...`;
export const TRANSCRIBE_UPLOAD = 'Receiving content from S3, uploading to Transcribe';
export const IN_PROGRESS = 'In Progress...';
export const ERROR_MESSAGES = {
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