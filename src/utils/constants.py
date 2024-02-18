import boto3

BUCKET_NAME = "decipher-audio-files"
S3_CLIENT = boto3.client('s3')
AWS_REGION = 'us-west-2'
TRANSCRIBE_CLIENT = boto3.client('transcribe', region_name=AWS_REGION)
FILE_MAX_DURATION_SECONDS = 300
MAX_RETRIEVE_ATTEMPTS = 50
YOUTUBE_URL_BASE = "https://www.youtube.com/watch?v="
FIVE_MINUTES = 5 * 1024 * 1024
AUDIO_TOO_LARGE = 'Audio must be under 5 minutes (beta)'
S3_BUCKET_NAME = 'decipher-audio-files'
S3_BUCKET_URL = 's3://decipher-audio-files/'
DOWNLOADS_FOLDER = './downloads'
PORT = 3000
SERVER_STARTING_UP = 'Server is starting up...'
SERVER_RUNNING = f"Server is running on port {PORT}..."
TRANSCRIBE_UPLOAD = 'Receiving content from S3, uploading to Transcribe'
IN_PROGRESS = 'In Progress...'

# Error messages
TRANSCRIPTION_ERROR = 'Unable to process transcript: ',
TRANSCRIPTION_FAILED = 'Transcription failed: ',
S3_UPLOAD_ERROR = 'Error when uploading to S3: ',
INVALID_YOUTUBE_URL = 'Error with inputUrlRef: ',
FILE_TOO_LARGE = 'File is too large',
FINAL_STAGE_ERROR = 'Error at final stage  ',
USER_NOT_FOUND = 'User not found',
NO_DATA_FOUND = 'No data found',
INVALID_PASSWORD = 'Invalid password',
PERMISSION_DENIED = 'Permission denied',