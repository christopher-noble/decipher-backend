import boto3

BUCKET_NAME = "decipher-audio-files"
S3_CLIENT = boto3.client('s3')
TRANSCRIBE_CLIENT = boto3.client('transcribe', region_name='us-west-2')
FILE_MAX_DURATION_SECONDS = 300
MAX_RETRIEVE_ATTEMPTS = 50
YOUTUBE_URL_BASE = "https://www.youtube.com/watch?v="